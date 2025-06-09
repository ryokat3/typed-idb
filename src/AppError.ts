import { generateTypedError } from "./utils/TypedError"

type AppErrorType = {
    "All events not covered": string[],
    "Number of parameters is over limit": number,
    "Not expected type": string
}

export const AppError = generateTypedError<AppErrorType>(Symbol("TypedIDBError"))