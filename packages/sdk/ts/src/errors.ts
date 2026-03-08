export class MaschinaError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "MaschinaError";
  }

  static async fromResponse(res: Response): Promise<MaschinaError> {
    let message = res.statusText;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body?.error?.message ?? body?.message ?? message;
      code = body?.error?.code ?? body?.code;
    } catch {
      // ignore parse errors
    }
    return new MaschinaError(message, res.status, code);
  }
}
