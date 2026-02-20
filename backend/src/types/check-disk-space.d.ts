declare module 'check-disk-space' {
  export interface DiskSpaceInfo {
    diskPath: string;
    free: number;
    size: number;
  }

  export default function checkDiskSpace(path: string): Promise<DiskSpaceInfo>;
}
