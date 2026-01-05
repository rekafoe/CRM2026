export interface OrderFile {
  id: number;
  orderId: number;
  filename: string;
  originalName?: string;
  mime?: string;
  size?: number;
  uploadedAt: string;
  approved: number; // 0/1
  approvedAt?: string;
  approvedBy?: number;
}
