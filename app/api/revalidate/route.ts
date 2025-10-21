// app/api/revalidate/route.ts
import { revalidatePath } from 'next/cache'

export async function POST(req: Request) {
  const { token, path } = await req.json().catch(()=> ({}))
  if (token !== process.env.REVALIDATE_TOKEN) return new Response('nope', { status: 401 })
  revalidatePath(path)
  return Response.json({ revalidated: true })
}
