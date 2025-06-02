import { generateTypedError } from "./TypedError"

type AppErrorType = {
    allEventNotCovered: string[],
    "Number of parameters is over limit": number
}

export const AppError = generateTypedError<AppErrorType>(Symbol("TypedIDBError"))