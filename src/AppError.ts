import { generateTypedError } from "./TypedError"

type AppErrorType = {
    allEventNotCovered: string[]
}

export const AppError = generateTypedError<AppErrorType>(Symbol("TypedIDBError"))