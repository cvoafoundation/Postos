// FunctionsHttpError holds the server's response in context; its message
// only says "non-2xx". Read a clone so the original response remains usable.
export async function getFunctionError(error: any, data?: { error?: string } | null): Promise<string> {
  if (data?.error) return data.error
  if (error?.context instanceof Response) {
    try {
      const body = await error.context.clone().json()
      if (typeof body.error === 'string') return body.error
      if (typeof body.message === 'string') return body.message
    } catch { /* Fall back to the transport error below. */ }
    if (error.context.status === 401) return 'Your session expired or the function rejected it. Sign in again; if it persists, check the Supabase function authentication settings.'
    if (error.context.status === 404) return 'The invite-member function is not deployed in the connected Supabase project.'
  }
  return error?.message ?? 'Could not complete account setup.'
}
