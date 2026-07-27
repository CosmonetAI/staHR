declare module 'papaparse' {
  export type ParseError = {
    type: string
    code: string
    message: string
    row?: number
  }

  export type ParseResult<T> = {
    data: T[]
    errors: ParseError[]
    meta: Record<string, unknown>
  }

  export type ParseConfig<T> = {
    header?: boolean
    skipEmptyLines?: boolean | 'greedy'
    transformHeader?: (header: string, index: number) => string
    complete?: (results: ParseResult<T>) => void
    error?: (error: Error) => void
  }

  const Papa: {
    parse<T = Record<string, unknown>>(file: File | string, config: ParseConfig<T>): void
  }

  export default Papa
}
