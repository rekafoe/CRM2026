export class SupportError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = status === 404
      ? 'NotFoundError'
      : status === 401
        ? 'UnauthorizedError'
        : status === 403
          ? 'ForbiddenError'
          : status === 409
            ? 'ConflictError'
            : status === 400
              ? 'ValidationError'
              : 'Error'
  }
}
