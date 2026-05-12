export interface OrderFile {
  id: number;
  orderId: number;
  orderItemId?: number | null;
  filename: string;
  originalName?: string;
  mime?: string;
  size?: number;
  uploadedAt: string;
  approved: number; // 0/1
  approvedAt?: string;
  approvedBy?: number;
  storage?: 'local' | 's3' | string;
  externalProvider?: string | null;
  externalBucket?: string | null;
  externalKey?: string | null;
  externalUrl?: string | null;
  externalStatus?: 'ready' | 'processing' | 'failed' | string;
  artifactType?: string | null;
  checksum?: string | null;
  partNumber?: number | null;
  metadata?: string | null;
}
