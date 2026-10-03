import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createId } from '../common/id';

/** S3 compatible object storage (DigitalOcean Spaces) behind a presigned PUT. */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;

  constructor(private readonly config: ConfigService) {
    this.client = new S3Client({
      region: this.config.get<string>('SPACES_REGION', 'nyc3'),
      endpoint: this.config.get<string>('SPACES_ENDPOINT'),
      forcePathStyle: false,
      credentials: {
        accessKeyId: this.config.get<string>('SPACES_KEY', ''),
        secretAccessKey: this.config.get<string>('SPACES_SECRET', ''),
      },
    });
  }

  get maxBytes(): number {
    return Number(this.config.get<string>('UPLOAD_MAX_BYTES', '26214400'));
  }

  get configured(): boolean {
    return Boolean(this.config.get<string>('SPACES_KEY'));
  }

  async presignUpload(input: { cardId: string; fileName: string; mimeType: string }) {
    const attachmentId = createId();
    const safeName = input.fileName.replace(/[^\w.-]+/g, '_').slice(0, 120);
    const key = `cards/${input.cardId}/${attachmentId}/${safeName}`;
    const bucket = this.config.get<string>('SPACES_BUCKET', 'trello-clone-uploads');
    const publicBase = this.config.get<string>('SPACES_PUBLIC_BASE_URL', '');

    const uploadUrl = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: input.mimeType,
        ACL: 'public-read',
      }),
      { expiresIn: 900 },
    );

    return {
      attachmentId,
      uploadUrl,
      publicUrl: `${publicBase.replace(/\/$/, '')}/${key}`,
    };
  }
}
