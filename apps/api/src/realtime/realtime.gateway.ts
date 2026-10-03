import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  ROOMS,
  WS_EVENTS,
  wsBoardOpenSchema,
  wsCardMoveSchema,
  wsCardUpdateSchema,
  wsListMoveSchema,
  wsPresencePingSchema,
} from '@trello-clone/shared';
import type { Server, Socket } from 'socket.io';
import { TokenService } from '../auth/token.service';
import { CardsService } from '../cards/cards.service';
import { toApiError } from '../common/all-exceptions.filter';
import { AuthUser } from '../common/current-user.decorator';
import { ListsService } from '../lists/lists.service';
import { PermissionsService } from '../permissions/permissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

interface SocketState {
  user: AuthUser;
  avatarUrl: string | null;
  boards: Set<string>;
}

/**
 * Every handler here delegates to the same service method the REST controller
 * calls (spec rule 8). The gateway owns authentication, room membership and
 * presence only.
 */
@WebSocketGateway({
  cors: { origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000', credentials: true },
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly tokens: TokenService,
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
    private readonly realtime: RealtimeService,
    private readonly cards: CardsService,
    private readonly lists: ListsService,
  ) {}

  afterInit(server: Server) {
    this.realtime.bind(server);

    /*
     * Authentication runs as connection middleware rather than in
     * handleConnection. Middleware finishes before the client sees `connect`,
     * so a client that emits `board:open` immediately cannot outrun its own
     * session setup.
     */
    server.use(async (socket, next) => {
      try {
        const token = (socket.handshake.auth?.token ?? socket.handshake.query?.token) as
          | string
          | undefined;
        if (!token) throw new Error('missing token');

        const payload = this.tokens.verifyAccessToken(token);
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
        if (!user) throw new Error('unknown user');

        const state: SocketState = {
          user: { id: user.id, email: user.email, name: user.name },
          avatarUrl: user.avatarUrl,
          boards: new Set(),
        };
        socket.data.state = state;
        await socket.join(ROOMS.user(user.id));
      } catch {
        socket.data.state = null;
      }
      next();
    });
  }

  handleConnection(socket: Socket) {
    if (!this.stateOf(socket)) {
      socket.emit(WS_EVENTS.ERROR, {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid access token',
      });
      socket.disconnect(true);
    }
  }

  async handleDisconnect(socket: Socket) {
    const state = this.stateOf(socket);
    if (!state) return;
    for (const boardId of state.boards) {
      await this.realtime.removeViewer(boardId, socket.id).catch(() => undefined);
    }
  }

  @SubscribeMessage(WS_EVENTS.BOARD_OPEN)
  async onBoardOpen(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async (state) => {
      const { boardId } = wsBoardOpenSchema.parse(raw);
      await this.permissions.requireBoardView(boardId, state.user.id);

      await socket.join(ROOMS.board(boardId));
      state.boards.add(boardId);
      await this.realtime.addViewer(boardId, socket.id, {
        userId: state.user.id,
        name: state.user.name,
        avatarUrl: state.avatarUrl,
      });
    });
  }

  @SubscribeMessage(WS_EVENTS.BOARD_CLOSE)
  async onBoardClose(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async (state) => {
      const { boardId } = wsBoardOpenSchema.parse(raw);
      await socket.leave(ROOMS.board(boardId));
      state.boards.delete(boardId);
      await this.realtime.removeViewer(boardId, socket.id);
    });
  }

  @SubscribeMessage(WS_EVENTS.CARD_MOVE)
  async onCardMove(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async (state) => {
      const payload = wsCardMoveSchema.parse(raw);
      await this.cards.move(payload.cardId, state.user.id, {
        targetListId: payload.targetListId,
        beforeCardId: payload.beforeCardId,
        afterCardId: payload.afterCardId,
      });
    });
  }

  @SubscribeMessage(WS_EVENTS.LIST_MOVE)
  async onListMove(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async (state) => {
      const payload = wsListMoveSchema.parse(raw);
      await this.lists.move(payload.listId, state.user.id, {
        beforeListId: payload.beforeListId,
        afterListId: payload.afterListId,
      });
    });
  }

  @SubscribeMessage(WS_EVENTS.CARD_UPDATE)
  async onCardUpdate(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async (state) => {
      const payload = wsCardUpdateSchema.parse(raw);
      await this.cards.update(payload.cardId, state.user.id, payload.patch);
    });
  }

  @SubscribeMessage(WS_EVENTS.PRESENCE_PING)
  async onPresencePing(@ConnectedSocket() socket: Socket, @MessageBody() raw: unknown) {
    await this.guard(socket, async () => {
      const { boardId } = wsPresencePingSchema.parse(raw);
      await this.realtime.touchViewer(boardId, socket.id);
    });
  }

  private stateOf(socket: Socket): SocketState | null {
    return (socket.data?.state as SocketState | null) ?? null;
  }

  /** Resolves the socket's session and maps any failure onto the error contract. */
  private async guard(socket: Socket, run: (state: SocketState) => Promise<void>) {
    const state = this.stateOf(socket);
    if (!state) {
      socket.emit(WS_EVENTS.ERROR, {
        code: 'UNAUTHENTICATED',
        message: 'Missing or invalid access token',
      });
      return;
    }
    try {
      await run(state);
    } catch (error) {
      const mapped = toApiError(error, this.logger);
      socket.emit(WS_EVENTS.ERROR, { code: mapped.code, message: mapped.message });
    }
  }
}
