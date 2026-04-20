export type TrpcContext = {
  requestId: string;
  ip?: string;
  userAgent?: string;
  auth?: {
    userId: string;
    role: "user" | "admin" | "owner";
  };
};
