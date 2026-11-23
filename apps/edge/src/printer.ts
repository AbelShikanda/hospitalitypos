import { connect } from "node:net";

export interface PrintPayload {
  text: string;
  bytes: string;
  kickDrawer: boolean;
}

export async function sendPrintJob(payload: PrintPayload): Promise<void> {
  const host = process.env.PRINTER_HOST;
  const port = Number(process.env.PRINTER_PORT ?? 9100);
  if (!host) throw new Error("printer_not_configured");

  const bytes = Buffer.from(payload.bytes, "base64");
  const data = payload.kickDrawer
    ? Buffer.concat([bytes, Buffer.from([0x1b, 0x70, 0x00, 0x19, 0xfa])])
    : bytes;

  await new Promise<void>((resolve, reject) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("printer_timeout"));
    }, 5000);

    socket.once("connect", () => {
      socket.write(data);
    });
    socket.on("data", () => {});
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.once("close", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}
