import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import * as SRTE from "fp-ts/StateReaderTaskEither"
import * as RA from "fp-ts/ReadonlyArray"
import { pipe, identity } from "fp-ts/function"
import * as OC from "./OnCallback"
import { KeyPath } from "boost-ts.types/KeyPath"
import { AppError } from "./AppError"


////////////////////////////////////////////////////////////////
// Database Scheme Types
////////////////////////////////////////////////////////////////

type KeyPathType<T> = KeyPath<T, ".", false, IDBValidKey>
type StrKey<T> = Extract<keyof T, string>

export type UserDataType = {
    [storeName:string]:unknown
}


type IndexScheme<StoreData, UserKeyPath=KeyPathType<StoreData>> = {
    readonly keyPath: StrKey<UserKeyPath>,
    readonly options: {
        readonly unique: boolean
        readonly multiEntry: boolean
        readonly locale: string|"auto"|null|undefined
    }
}

type StoreObjectScheme<StoreData, UserKeyPath = KeyPathType<StoreData>> = [ UserKeyPath ] extends [ Record<string,unknown> ] ? {
    readonly keyPath: undefined | StrKey<UserKeyPath> | readonly StrKey<UserKeyPath>[]    
    readonly autoIncrement: boolean,
    readonly indexes: {
        readonly [indexName:string]: IndexScheme<UserKeyPath>
    }           
} : {
    readonly keyPath: undefined,    
    readonly autoIncrement: boolean,
    readonly indexes: {}
}

export type DatabaseScheme<T extends UserDataType> = {
    readonly [storeName in StrKey<T>]: StoreObjectScheme<T[storeName]>
}


////////////////////////////////////////////////////////////////
// Scheme Builder
////////////////////////////////////////////////////////////////

export function TypedIDBBuilder<T>() {
    return new TypedIDBDatabaseBuilder<T, { [K in keyof T]: KeyPathType<T[K]> }>({})
}

class TypedIDBDatabaseBuilder<
    T,
    KP,
    StoreKeyValue = {},
    IndexKeyValue = {},
    OutOfLineKey = {},
    UsedStoreNames = never
> {    
    constructor(protected readonly scheme:any = {}) {}

    // #Parameter: 0    
    objectStore<const StoreName extends Exclude<keyof KP, UsedStoreNames>>
            (storeName:StoreName):
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreName, UsedStoreNames | StoreName>
    // #Parameter: 1
    objectStore<const StoreName extends Exclude<keyof KP, UsedStoreNames>,
        K1 extends keyof KP[StoreName]|boolean>
            (storeName:StoreName, k1:K1): K1 extends keyof KP[StoreName] ?
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue & { [K in StoreName]: KP[StoreName][K1] }, IndexKeyValue, OutOfLineKey, StoreName, UsedStoreNames | StoreName> : 
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey & { [K in StoreName]: K1 extends false ? true : false }, StoreName, UsedStoreNames | StoreName>
    // #Parameter: 2                
    objectStore<const StoreName extends Exclude<keyof KP, UsedStoreNames>,
        K1 extends keyof KP[StoreName], K2 extends Exclude<keyof KP[StoreName], K1>|(KP[StoreName][K1] extends number ? boolean : false)>
            (storeName:StoreName, k1:K1, k2:K2): K2 extends keyof KP[StoreName] ?
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue & { [K in StoreName]: [ KP[StoreName][K1], KP[StoreName][K2] ] }, IndexKeyValue, OutOfLineKey, StoreName, UsedStoreNames | StoreName> :
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue & { [K in StoreName]: KP[StoreName][K1] }, IndexKeyValue, OutOfLineKey & { [K in StoreName]: K2 extends false ? true : false }, StoreName, UsedStoreNames | StoreName>
    // #Parameter: 3                
    objectStore<const StoreName extends Exclude<keyof KP, UsedStoreNames>,
        K1 extends keyof KP[StoreName], K2 extends Exclude<keyof KP[StoreName], K1>, K3 extends Exclude<keyof KP[StoreName], K1|K2>>
            (storeName:StoreName, k1:K1, k2:K2, k3:K3):
                TypedIDBObjectStoreBuilder<T, KP, StoreKeyValue & { [K in StoreName]: [ KP[StoreName][K1], KP[StoreName][K2], KP[StoreName][K3] ] }, IndexKeyValue, OutOfLineKey, StoreName, UsedStoreNames | StoreName>                                                  
    objectStore<const StoreName extends Exclude<keyof KP, UsedStoreNames>>(storeName:StoreName, ...param:any[]):any    
    {   
        console.log((param.length === 0) ? {
                    keyPath: null,
                    autoIncrement: false
                } : (typeof param[-1] === "boolean") ? {
                    keyPath: (param.length === 1) ? null : (param.length === 2) ? param[0] : param.slice(0,-1),                
                    autoIncrement: param[-1]
                } : {
                    keyPath: (param.length === 1) ? param[0] : param.slice(0,-1),
                    autoIncrement: false
                })              
        return new TypedIDBObjectStoreBuilder<
            T,
            KP,
            StoreKeyValue,            
            IndexKeyValue,            
            OutOfLineKey,
            StoreName,            
            UsedStoreNames | StoreName
        >({
            ...this.scheme,
            [storeName] : {
                option: (param.length === 0) ? {
                    keyPath: null,
                    autoIncrement: false
                } : (typeof param[-1] === "boolean") ? {
                    keyPath: (param.length === 1) ? null : (param.length === 2) ? param[0] : param.slice(0,-1),                
                    autoIncrement: param[-1]
                } : {
                    keyPath: (param.length === 1) ? param[0] : param.slice(0,-1),
                    autoIncrement: false
                },
                index: {}
            }
        }, storeName)
    }

    factory() {
        return new TypedIDBFactory<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey>(buildIDBDatabase(this.scheme))
    }

    connectTE(name:string, version:number|undefined = undefined) {
        return pipe(
            TE.Do,
            TE.apS("factory", TE.of(this.factory())),
            TE.bind("req", ({ factory }) => factory.open(name, version)),                        
            TE.bindW("db", ({ req }) => req.result),
            TE.map(({db})=> new TIDBDatabase<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey>(db)),            
        )
    }

    async connect(name:string, version:number|undefined = undefined) {
        return await pipe(
            this.connectTE(name, version),
            TE.getOrElseW((_)=>async()=>undefined)
        )()
    }        
}


class TypedIDBObjectStoreBuilder<
    T,
    KP,
    StoreKeyValue,
    IndexKeyValue,
    OutOfLineKey,
    StoreName extends keyof KP,    
    UsedStoreNames,
    UsedIndexKeyPath = never,
    UsedIndexNames = never
> extends TypedIDBDatabaseBuilder<T, KP, StoreKeyValue, IndexKeyValue, UsedStoreNames> {    

    constructor(scheme:any, private readonly storeName:keyof typeof scheme) {
        super(scheme)    
    }

    index<
        const IndexKeyPath extends Exclude<keyof KP[StoreName], UsedIndexKeyPath>,
        const IndexName extends string
    >(
        indexName:IndexName extends UsedIndexNames ? never : IndexName,
        indexKeyPath:IndexKeyPath,
        option: Required<IDBIndexParameters> = { unique: false, multiEntry:false, }
    ) {        
        return new TypedIDBObjectStoreBuilder<
            T,
            KP,
            StoreKeyValue,
            IndexKeyValue & { [K1 in StoreName]: { "index" : { [K2 in IndexName]: KP[StoreName][IndexKeyPath]} } },
            OutOfLineKey,
            StoreName,            
            UsedStoreNames,
            UsedIndexKeyPath | IndexKeyPath,
            UsedIndexNames | IndexName         
        >({
            ...this.scheme,
            [this.storeName]: {
                ...this.scheme[this.storeName],
                index: {
                    ...this.scheme[this.storeName].index,
                    [indexName]: {
                        keyPath: indexKeyPath,
                        option: option
                    }
                }
            }
        }, this.storeName)
    }        
}


////////////////////////////////////////////////////////////////
// onUpgradeNeeded
////////////////////////////////////////////////////////////////

function buildIDBIndex(store:IDBObjectStore, indexName:string, indexOption:Required<IDBIndexParameters>): IDBIndex {
    try {
        const index = store.index(indexName)          
        if ((index.keyPath === indexName) && (index.unique === indexOption.unique) && (index.multiEntry === indexOption.multiEntry)) {
            return index
        }
        else {
            store.deleteIndex(indexName)
        }
    }  
    catch (e) {
        if (!((e instanceof DOMException) && (e.name === "NotFoundError"))) {
            throw e    
        }
    }
    return store.createIndex(indexName, indexName, indexOption)
}

function buildIDBObjectStore(db:IDBDatabase, name:string, option:Required<IDBObjectStoreParameters>): IDBObjectStore {

    try {
        const store = db.transaction(name, "readonly").objectStore(name)        
        if ((store.keyPath === option.keyPath) || (store.autoIncrement === option.autoIncrement)) {
            return store
        }
        else {            
            db.deleteObjectStore(name)
        }
    }
    catch (e) {        
        // NotFoundError fired if ObjectStore not exist
        if (!((e instanceof DOMException) && (e.name !== "NotFoundError"))) {
            window.DEBUG && console.log(`DOMException when upgrading: ${e}`)
            throw e    
        }
    }    
    return db.createObjectStore(name, option)
}

function buildIDBDatabase(scheme:any) {

    return async (db: IDBDatabase):Promise<void> => {            
        for (const [storeName, storeOption] of Object.entries(scheme)) {
            
            const store = buildIDBObjectStore(db, storeName, (storeOption as any).option as Required<IDBObjectStoreParameters>)
                        
            for (const [indexName, indexOption] of Object.entries((storeOption as any).index)) {            
                buildIDBIndex(store, indexName, indexOption as Required<IDBIndexParameters>)
            }            
        }
    }
} 




////////////////////////////////////////////////////////////////
// IDBFactory Typed Thin Wrapper
////////////////////////////////////////////////////////////////

class TypedIDBFactory<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey> {
   
    private readonly factory:IDBFactory = indexedDB
    private readonly buildCallback: (event:IDBVersionChangeEvent)=>Promise<E.Either<unknown,IDBOpenDBRequest>>

    constructor(builder:(db: IDBDatabase)=>Promise<void> ) {
        this.buildCallback =  (event: IDBVersionChangeEvent) => pipe(
            TE.Do,
            TE.bind("req", () => TE.fromNullable("IDBOpenDBRequest is null")(event.target as IDBOpenDBRequest | null)),
            TE.bind("db", ({ req }) => TE.of(req.result)),
            TE.tapTask(({ db }) => () => builder(db)), 
            TE.tap(({ req }) => TE.fromNullable("Not error")(req.transaction)),
            TE.tap(({ req }) => OC.taskify(req.transaction, OC.defaultSet)),
            TE.map(({ req }) => req)
        )() 
    }
          
    open(name:string, version:number|undefined = undefined) {
        return pipe(            
            TE.fromNullable("IDBFactory.open() returns null")(indexedDB.open(name, version)),
            TE.chainW((req)=>OC.taskify(req, {
                ...OC.defaultSet,                                
                onupgradeneeded: this.buildCallback,
                onsuccess: (_e)=>req,           
                onblocked: OC.failureCallback
            })),                        
            TE.map((newReq)=>new TypedIDBRequest(newReq, (db)=>new TypedIDBDatabase<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey>(db)))                        
        )      
    }

    deleteDatabase(name:string) {
        return pipe(
            TE.right(this.factory.deleteDatabase(name)),            
            TE.chainW((req)=>OC.taskify(req, {
                ...OC.defaultSet,
                onupgradeneeded: OC.successCallback,
                onversionchange: OC.successCallback,
                onblocked: OC.successCallback
            })),
            TE.tapError((e)=>TE.of(console.log(e.toString())))
        )
    }
    
    cmp(first:any, second:any) {
        return this.factory.cmp(first, second)    
    }
    
    databases() {
        return TE.tryCatch(()=>this.factory.databases(), identity)
    }    
}

class TypedIDBRequest<ResultType> {

    constructor(
        private readonly request: IDBRequest,        
        private readonly resultWrapper: (result: any) => ResultType
    ) {}

    cont<T>(f: (r: ResultType) => TypedIDBRequest<T>){
        return TE.tryCatch<unknown, TypedIDBRequest<T>>(()=>new Promise((resolv, reject) => {
            this.request.onsuccess = (_e: Event) => {
                resolv(f(this.request.result))
            }
            this.request.onerror = (e:Event) => {
                reject(e)
            }
        }), identity)
    }

    cont2<T>(f: (r: ResultType) => TypedIDBRequest<T>):TE.TaskEither<unknown, [ResultType, TypedIDBRequest<T>]> {
        return TE.tryCatch<unknown, [ResultType, TypedIDBRequest<T>]>(()=>new Promise((resolv, reject) => {
            this.request.onsuccess = (_e: Event) => {                                
                resolv([this.resultWrapper(this.request.result), f(this.request.result)] as const)                   
            }
            this.request.onerror = (e:Event) => {
                reject(e)
            }
        }), identity)
    }

    get result() {
        return pipe(
            this.request.readyState === "done" ? TE.right(this.request) : pipe(OC.taskify(this.request, OC.defaultSet), TE.map((_)=>this.request)),
            TE.map((req)=>this.resultWrapper(req.result))
        )
    }    
}

class TypedIDBDatabase<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey> {

    constructor(private readonly db:IDBDatabase){ }

    // TODO: mode と options はないかもしれない overload    
    transaction<const StoreNames extends (keyof T & string) | (keyof T & string)[]>(
        storeNames: StoreNames,                             // StoreNames for ["key1", "key2"] is ("key1"|"key2")[]
        mode: "readonly"|"readwrite"|undefined = undefined,
        options: {
            durability: "default"|"strict"|"relaxed"
        }
    ) {             
        return pipe(
            E.tryCatch(()=>this.db.transaction(storeNames, mode, options), identity),
            TE.fromEither,                        
            TE.map((trx)=>new TypedIDBTransaction<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreNames extends (infer X)[] ? X : StoreNames>(trx))
        )
    }

    close():void {        
        this.db.close()
    }    
}

class TypedIDBTransaction<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreNameList> { 

    public readonly done:TE.TaskEither<[string, string], Event>

    constructor(
        private readonly trx:IDBTransaction
    ) {
        this.done = OC.taskify(this.trx, OC.defaultSet)
    }

    // TODO: StoreName は transaction で選ばれたものだけ候補にでるようにする
    // objectStore<StoreName extends StrKey<T>>(name:StoreName) {
    objectStore<const StoreName extends StoreNameList & keyof T & string>(name:StoreName) {
        return pipe(
            E.tryCatch<DOMException, IDBObjectStore>(()=>this.trx.objectStore(name), identity as any),            
            E.map((store)=>new TypedIDBObjectStore<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreName>(store))
        )
    }  
}    

class TypedIDBObjectStoreReadOnly<T, _KP, StoreKeyValue, _IndexKeyValue, _OutOfLineKey, StoreName extends keyof T> {    

    constructor(
        protected readonly store:IDBObjectStore        
    ) {}
    
    get(keyValue:StoreKeyValue[StoreName & keyof StoreKeyValue] & IDBValidKey) {        
        return new TypedIDBRequest<T[StoreName]>(this.store.get(keyValue), identity as any)
    }
}

class TypedIDBObjectStore<T, _KP, StoreKeyValue, _IndexKeyValue, OutOfLineKey, StoreName extends keyof T> extends
        TypedIDBObjectStoreReadOnly<T, _KP, StoreKeyValue, _IndexKeyValue, OutOfLineKey, StoreName> {    

    constructor(
        readonly store:IDBObjectStore        
    ) {
        super(store)
    }
    
    add(value:T[StoreName]): TypedIDBRequest<unknown>    
    add(value:T[StoreName], key:StoreName extends keyof OutOfLineKey ? OutOfLineKey[StoreName] extends true ? IDBValidKey : never : never): TypedIDBRequest<unknown>
    add(value:T[StoreName], key:any=undefined) {                
        return new TypedIDBRequest((key === undefined) ? this.store.add(value) : this.store.add(value, key), identity)
    }
}

////////////////////////////////////////////////////////////////
// Typed IDB 
////////////////////////////////////////////////////////////////

function reduceEither<E,A,B>(aryE:E.Either<E,A>[], f:(b:B, a:A)=>B, curE:E.Either<E,B>):E.Either<E,B> {
    if (aryE.length === 0) {
        return curE
    }
    else {
        return pipe(
            E.Do,
            E.bind("acc", ()=>curE),
            E.bind("cur", ()=>aryE[0]),
            E.chain(({acc, cur})=>reduceEither(aryE.slice(1), f, E.right(f(acc, cur))))
        )      
    }    
}

type CreateTRXParamType<Handler, StoreNames, Mode extends "readonly"|"readwrite"> = 
    Handler extends TIDBDatabase<infer T, infer KP, infer StoreKeyValue, infer IndexKeyValue, infer OutOfLineKey> | 
                    E.Either<unknown, TIDBDatabase<infer T, infer KP, infer StoreKeyValue, infer IndexKeyValue, infer OutOfLineKey>> | 
                    Promise<E.Either<unknown, TIDBDatabase<infer T, infer KP, infer StoreKeyValue, infer IndexKeyValue, infer OutOfLineKey>>> |
                    TE.TaskEither<unknown, TIDBDatabase<infer T, infer KP, infer StoreKeyValue, infer IndexKeyValue, infer OutOfLineKey>> ?
        StoreNames extends (keyof T & string) | (keyof T & string)[] ?
            StoreNames extends (infer X)[] ? 
                Mode extends "readonly" ?
                    { [K in X & keyof T]:TypedIDBObjectStoreReadOnly<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, K> } :
                    { [K in X & keyof T]:TypedIDBObjectStore<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, K> } :
                TypedIDBObjectStore<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreNames & keyof T> :
            never :
        never

        
export type TRXParamType<TRX> = 
    [ TRX extends null|undefined ? never : TRX ] extends [ (cb:(p:infer P)=>unknown)=>unknown |
            E.Either<unknown, (cb:(p:infer P)=>unknown)=>unknown> | 
            Promise<E.Either<unknown, (cb:(p:infer P)=>unknown)=>unknown>> |
            TE.TaskEither<unknown, (cb:(p:infer P)=>unknown)=>unknown> ] ? P : never  

class TIDBDatabase<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey> {

    constructor(   
        private readonly database: TypedIDBDatabase<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey>,
    ) {}

    private createCallbackParameter<const StoreNames extends (keyof T & string) | (keyof T & string)[], const Mode extends "readonly"|"readwrite"> (
        transaction:TypedIDBTransaction<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, StoreNames extends (infer X)[] ? X : StoreNames>,    
        storeNames: StoreNames,
        _mode: Mode,
    ): E.Either<DOMException, CreateTRXParamType<typeof this, StoreNames, Mode>> {
        if (typeof storeNames === 'object' && Array.isArray(storeNames)) {
            return reduceEither(
                RA.fromArray(storeNames).map((name:string)=>pipe(
                    transaction.objectStore(name as any),
                    E.map((store)=>[name, store] as const)                
                )),
                (acc:{ [k:string]:any }, cur:readonly [string, any]) => { return { ...acc, [cur[0]]:cur[1] } },
                E.right({})
            ) as any
            
        }
        else if (typeof storeNames === 'string') {
            return transaction.objectStore(storeNames as any) as any
        }
        else {
            throw AppError.create("Not expected type", typeof storeNames)
        }
    }

    transactionTE<const StoreNames extends (keyof T & string) | (keyof T & string)[], const Mode extends "readonly"|"readwrite">(        
        storeNames: StoreNames,
        mode: Mode,        
        options: {
            durability: "default"|"strict"|"relaxed"
        }
    ) {        
        return <const R>(callback:(param:CreateTRXParamType<typeof this, StoreNames, Mode>)=>R):TE.TaskEither<unknown, R> => pipe(
            this.database.transaction(storeNames, mode, options),
            TE.chainW((txn) => TE.fromEither(this.createCallbackParameter(txn, storeNames, mode))),
            TE.map((param)=>(callback(param)))
        )      
    }

    transaction<const StoreNames extends (keyof T & string) | (keyof T & string)[], const Mode extends "readonly"|"readwrite">(        
        storeNames: StoreNames,
        mode: Mode,        
        options: {
            durability: "default"|"strict"|"relaxed"
        },
        errorVal = undefined
    ) {
        return <const R>(callback:(param:CreateTRXParamType<typeof this, StoreNames, Mode>)=>R):Promise<R|typeof errorVal> => {
            return pipe(
                this.database.transaction(storeNames, mode, options),
                TE.chainW((txn) => TE.fromEither(this.createCallbackParameter(txn, storeNames, mode))),
                TE.map((param) => callback(param)),
                TE.tapIO((data)=>()=>console.log(`out result: ${JSON.stringify(data)}`)),
                TE.getOrElseW((_) => async () => errorVal)
            )()          
        }
    }

    cleanup() {
        this.database.close()
    }    
}


export const chainWithContext = <S, R, E, A, B>(f: (a: A, r: R, s: S) => TE.TaskEither<E, B>) => (
  ma: SRTE.StateReaderTaskEither<S, R, E, A>
): SRTE.StateReaderTaskEither<S, R, E, B> => (s1) => (r) =>
  pipe(
    ma(s1)(r),
    TE.chain(([a, s2]) =>
      pipe(
        f(a, r, s2),
        TE.map((b) => [b, s2])
      )
    )
  )

export const chainWithContext2 = <S, R, E, A, B>(f: (a: A, r: R, s: S) => TE.TaskEither<E, [B, S]>) => (
  ma: SRTE.StateReaderTaskEither<S, R, E, A>
): SRTE.StateReaderTaskEither<S, R, E, B> => (s1) => (r) =>
  pipe(
    ma(s1)(r),
    TE.chain(([a, s2]) => f(a, r, s2))
  )