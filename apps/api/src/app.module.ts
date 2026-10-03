import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ActivityModule } from './activity/activity.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { AccessGuard } from './auth/access.guard';
import { AuthModule } from './auth/auth.module';
import { BoardsModule } from './boards/boards.module';
import { CardsModule } from './cards/cards.module';
import { ChecklistsModule } from './checklists/checklists.module';
import { CommentsModule } from './comments/comments.module';
import { LabelsModule } from './labels/labels.module';
import { ListsModule } from './lists/lists.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrderingModule } from './ordering/ordering.module';
import { PermissionsModule } from './permissions/permissions.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { SearchModule } from './search/search.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

import { DemoModule } from './demo/demo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    ActivityModule,
    NotificationsModule,
    PermissionsModule,
    OrderingModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    BoardsModule,
    ListsModule,
    CardsModule,
    LabelsModule,
    ChecklistsModule,
    CommentsModule,
    AttachmentsModule,
    SearchModule,
    RealtimeModule,
    DemoModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
