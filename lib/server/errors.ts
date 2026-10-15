export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) { super(message); this.name = "AppError"; }
}
export function databaseError(message: string): never {
  const map: Record<string, [string, number]> = {
    EVENT_UNAVAILABLE: ["As vendas deste evento estão indisponíveis.", 409],
    IDEMPOTENCY_CONFLICT: ["Esta tentativa já foi usada para outro pedido. Inicie uma nova compra.", 409],
    INVALID_BUYER: ["Confira o nome completo e o CPF.", 400],
    ADMIN_REQUIRED: ["Acesso administrativo necessário.", 403],
    VERSION_CONFLICT: ["O evento foi atualizado. Recarregue antes de editar.", 409],
    INVALID_EVENT: ["Confira os dados e horários do evento.", 400],
    INVALID_PAYMENT: ["Não foi possível iniciar esta cobrança de teste.", 409],
  };
  const code = Object.keys(map).find((key) => message.includes(key));
  if (code) throw new AppError(code, map[code][0], map[code][1]);
  throw new AppError("DATABASE_UNAVAILABLE", "O serviço está indisponível. Tente novamente em alguns instantes.", 503);
}
