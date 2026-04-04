export interface SyncResponse {
  status: "unsupported" | "success" | "error";
  message: string;
}
