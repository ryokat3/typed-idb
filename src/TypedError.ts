
export function generateTypedError<T extends { [key:string]:any }> (errTag: symbol) {

    class TypedError<T extends { [key:string]:any }, EID extends keyof T> extends Error {
        public readonly errTag = errTag
        public readonly errId: EID
        public readonly errInfo: T[EID]
    
        constructor(
            errId: EID,
            ...errInfo: T[EID] extends void|never|null|undefined ? [] : [ T[EID] ]
        ) {
            super()
            this.errId = errId
            this.errInfo = errInfo[0] as T[EID]
        }
    }

    type DistributiveTypedError<T extends { [key:string]:any }, EID> = EID extends keyof T ? TypedError<T, EID> : never

    return {
        create: <EID extends keyof T>(error: EID, ...param: T[EID] extends void | never | null | undefined ? [] : [T[EID]]) => {
            return new TypedError<T, EID>(error, ...param)
        },
        isError: (target:any):target is DistributiveTypedError<T, keyof T> => {
            return (target instanceof TypedError) && ('errTag' in target) && ('errId' in target) && ('errInfo' in target) && (target.errTag == errTag)
        }
    }
}