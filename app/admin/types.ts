// app/admin/types.ts
export type PipelineActionResult = {
  ok: boolean
  status: number
  body: unknown
  error?: string
}

export type PipelineAction = () => Promise<PipelineActionResult>

export type PipelineActionState = {
  label: string
  handler: PipelineAction
}
