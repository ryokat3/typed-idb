import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import { pipe, identity } from "fp-ts/function"
import * as OC from "./OnCallback"
import { KeyPath } from "boost-ts.types"

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
/*
    client<A,E>(cb: (stores:{[K in keyof T]:TypedIDBObjectStore<T, KP, StoreKeyValue, IndexKeyValue, OutOfLineKey, K>})=>TE.TaskEither<A,E>) {
        return cb
    }
*/        
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

class TypedIDBObjectStore<T, _KP, StoreKeyValue, _IndexKeyValue, OutOfLineKey, StoreName extends keyof T> {    

    constructor(
        private readonly store:IDBObjectStore        
    ) {}
    
    add(value:T[StoreName]): TypedIDBRequest<void>    
    add(value:T[StoreName], key:StoreName extends keyof OutOfLineKey ? OutOfLineKey[StoreName] extends true ? IDBValidKey : never : never): TypedIDBRequest<void>
    add(value:T[StoreName], key:any=undefined) {                
        return new TypedIDBRequest((key === undefined) ? this.store.add(value) : this.store.add(value, key), identity as any)
    }
    
    get(keyValue:StoreKeyValue[StoreName & keyof StoreKeyValue] & IDBValidKey) {        
        return new TypedIDBRequest(this.store.get(keyValue), identity as any)
    }
}

////////////////////////////////////////////////////////////////
// IDBFactory Wrapper
////////////////////////////////////////////////////////////////

/*
function createOnUpgradeNeeded(idbSetup:(db:IDBDatabase)=>Promise<void>) {

    return async (event:IDBVersionChangeEvent) => await pipe(            
        TE.Do,            
        TE.bind("req", ()=>TE.fromNullable("IDBOpenDBRequest is null")(event.target as IDBOpenDBRequest | null)),                        
        TE.bind("db", (e)=>TE.of(e.req.result)), 
        TE.tapTask(({db})=>()=>idbSetup(db)),
        TE.bind("txn", (e)=>TE.fromNullable("IDBOpenDBRequest transaction is null")(e.req.transaction)),
        TE.tap(({txn})=>OC.taskify(txn, OC.defaultSet)),            
        TE.map(({db})=>db)
    )()
}


class TypedIDBFactory<DbData extends Record<string,unknown>> {

    constructor(
        private readonly idbSetup:(db:IDBDatabase)=>Promise<void>,
        private readonly dbName:string,
        private readonly dbVersion?:number
    ) {}

    openDb() {                
        const onUpgradeNeeded = createOnUpgradeNeeded(this.idbSetup)

        return pipe(                
            TE.right(typeof(this.dbVersion) !== 'undefined' ? indexedDB.open(this.dbName, this.dbVersion) : indexedDB.open(this.dbName)),               
            TE.chain((req)=>OC.taskify(req, {
                ...OC.defaultSet,
                onupgradeneeded: onUpgradeNeeded,                    
                onsuccess: (ev:Event)=>E.right((ev.target as IDBOpenDBRequest).result),
                onblocked: OC.failureCallback
            })),
            TE.map((db)=>new TypedIDBDatabase<DbData>(db))           
        )                                  
    }

    deleteDb() {
        return pipe(
            TE.right(indexedDB.deleteDatabase(this.dbName)),
            TE.chain((req)=>OC.taskify(req, {
                ...OC.defaultSet,
                onupgradeneeded: OC.failureCallback, // never fired for deleteDatabase but necessary for type
                onblocked: OC.failureCallback // never fired for deleteDatabase but necessary for type
            }))
        )
    }
}

////////////////////////////////////////////////////////////////
// IDBDatabase Wrapper
////////////////////////////////////////////////////////////////

class TypedIDBDatabase<DbData extends Record<string,unknown>> {
    constructor(
        private readonly db: IDBDatabase     
    ) {}

    getStore<StoreName extends keyof DbData & string>(storeName: StoreName) {
        return new TypedIDBStore<DbData, StoreName>(this.db, storeName)
    }

    close() {
        this.db.close()
    }

    delete() {
        const db = this.db  
        return OC.taskify(window.indexedDB.deleteDatabase(db.name), {
            ...OC.defaultSet,
            onblocked: (e) => { db.close(); return E.right(e) },
            onupgradeneeded: OC.noCallback
        })
    }
}

////////////////////////////////////////////////////////////////
// IDBStore Wrapper
////////////////////////////////////////////////////////////////

class TypedIDBStore<DbData extends Record<string,unknown>, StoreName extends keyof DbData & string> {
    constructor(
        private readonly db: IDBDatabase,
        private readonly storeName: StoreName
    ) {}

    private getStore(mode:IDBTransactionMode) {
        const transaction = this.db.transaction(this.storeName, mode)
        return transaction.objectStore(this.storeName)
    }
    
    add(value: DbData[StoreName]) {        
        const store = this.getStore("readwrite")
        return OC.taskify(store.add(value), OC.defaultSet)
    }

    get(keyValue: any) {
        const store = this.getStore("readonly")
        return OC.taskify(store.get(keyValue), {
            ...OC.defaultSet,
            onsuccess: (ev)=> (ev.target != null) ? E.right((ev.target as IDBRequest).result as DbData[StoreName]) : E.left(ev)            
        })
    }
}

////////////////////////////////////////////////////////////////
// IDBIndex Wrapper
////////////////////////////////////////////////////////////////

class TypedIDBIndex {
    constructor(
        private readonly idbIndex: IDBIndex
    ) {}

    count() {
        return OC.taskify(this.idbIndex.count(), OC.defaultSet)
    }
}

////////////////////////////////////////////////////////////////
// IDB Setup
////////////////////////////////////////////////////////////////

type OnUpgradeNeededType = {
    [storeName: string]: {
        autoIncrement: boolean,
        keyPath: string | undefined,
        index: {
            [indexName: string]: {
                keyPath: string[],
                unique: boolean,
                multiEntry: boolean
            }
        }
    }
}

function createOnUpgradeNeededCallback(storeInfo: OnUpgradeNeededType) {        
    return async (db: IDBDatabase):Promise<void> => {            
        for (const [storeName, storeOption] of Object.entries(storeInfo)) {
            const storeParam: IDBObjectStoreParameters = (storeOption.keyPath !== undefined) ? {
                keyPath: storeOption.keyPath,
                autoIncrement: storeOption.autoIncrement
            } : {
                autoIncrement: storeOption.autoIncrement
            }
            const store = db.createObjectStore(storeName, storeParam)
            for (const [indexName, indexOption] of Object.entries(storeOption.index)) {
                store.createIndex(indexName, indexOption.keyPath.join('.'), {
                    unique: indexOption.unique,
                    multiEntry: indexOption.multiEntry
                })
            }
        }
    }
}

export function startTypedIDB<DbData extends Record<string,unknown>> () {
    return new TypedIDBSetupBase<DbData, never>(Object.create(null))
}

class TypedIDBSetupBase<DbData extends Record<string,unknown>, StoreNameList extends keyof DbData & string> {
    constructor(
        protected readonly upgradeData: OnUpgradeNeededType
    ) {}

    store<StoreName extends Exclude<keyof DbData & string, StoreNameList>>(storeName:StoreName):TypedIDBStoreSetup<DbData, StoreNameList|StoreName, StoreName> {
        return new TypedIDBStoreSetup<DbData, StoreNameList | StoreName, StoreName>({
            ...this.upgradeData,
            [storeName]: {
                autoIncrement: false,
                keyPath: undefined,
                index: {}
            }
        }, storeName)
    }

    createFactory(dbName:string, dbVersion?:number): keyof DbData extends StoreNameList ? TypedIDBFactory<DbData>: never {        
        return new TypedIDBFactory(createOnUpgradeNeededCallback(this.upgradeData), dbName, dbVersion) as any
    } 
}


class TypedIDBStoreSetupBase<DbData extends Record<string,unknown>, StoreNameList extends keyof DbData & string, StoreName extends keyof DbData & string> extends TypedIDBSetupBase<DbData, StoreNameList> {   
    
    constructor(
        upgradeData:OnUpgradeNeededType,
        protected readonly storeName:StoreName
    ) {
        super(upgradeData)
    }

    index(indexName:string):TypedIDBIndexSetup<DbData,StoreNameList,StoreName> {        
        const storeOption = this.upgradeData[this.storeName]        
        return new TypedIDBIndexSetup<DbData,StoreNameList,StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...storeOption,
                index: {
                    ...storeOption.index,
                    [indexName]: {                        
                        keyPath: [],
                        unique: false,
                        multiEntry: false
                    }
                }
            }
        }, this.storeName, indexName)
    }
}


class TypedIDBStoreSetup<DbData extends Record<string,unknown>, StoreNameList extends keyof DbData & string, StoreName extends keyof DbData & string> extends TypedIDBStoreSetupBase<DbData, StoreNameList, StoreName> {
    constructor(
        upgradeData:OnUpgradeNeededType,
        storeName:StoreName
    ) {
        super(upgradeData, storeName)
    }

    autoIncrement(autoIncrement:boolean): TypedIDBStoreSetup<DbData,StoreNameList,StoreName> {
        const storeOption = this.upgradeData[this.storeName]
        return new TypedIDBStoreSetup<DbData, StoreNameList, StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...storeOption,
                autoIncrement: autoIncrement
            }
        }, this.storeName)
    }

    keyPath(keyPath:Cast<keyof KeyPathType<DbData[StoreName]>, string>):TypedIDBStoreSetup<DbData,StoreNameList,StoreName> {        
        return new TypedIDBStoreSetup<DbData, StoreNameList, StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...this.upgradeData[this.storeName],
                keyPath: keyPath
            }
        }, this.storeName)
    }

}

class TypedIDBIndexSetup<DbData extends Record<string,unknown>, StoreNameList extends keyof DbData & string, StoreName extends keyof DbData & string> extends TypedIDBStoreSetupBase<DbData, StoreNameList, StoreName> {
    constructor(
        upgradeData:OnUpgradeNeededType,
        storeName:StoreName,
        private readonly indexName:string                
    ) {
        super(upgradeData, storeName)
    }
    
    keyPath(keyPath:KeyPathType<DbData[StoreName]>):TypedIDBIndexSetup<DbData, StoreNameList, StoreName> {
        const storeOption = this.upgradeData[this.storeName]
        const indexOption = this.upgradeData[this.storeName]['index'][this.indexName]
        return new TypedIDBIndexSetup<DbData, StoreNameList, StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...storeOption,
                index: {
                    ...storeOption['index'],
                    [this.indexName]: {
                        ...indexOption,
                        // @ts-ignore
                        keyPath: keyPath as string[]
                    }
                }
            }
        }, this.storeName, this.indexName)
    }

    unique(unique:boolean): TypedIDBIndexSetup<DbData, StoreNameList, StoreName> {
        const storeOption = this.upgradeData[this.storeName]
        const indexOption = this.upgradeData[this.storeName]['index'][this.indexName]
        return new TypedIDBIndexSetup<DbData, StoreNameList, StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...storeOption,
                index: {
                    ...storeOption['index'],
                    [this.indexName]: {
                        ...indexOption,
                        unique: unique
                    }
                }
            }
        }, this.storeName, this.indexName)    
    }

    multiEntry(multiEntry:boolean): TypedIDBIndexSetup<DbData, StoreNameList, StoreName> {
        const storeOption = this.upgradeData[this.storeName]
        const indexOption = this.upgradeData[this.storeName]['index'][this.indexName]
        return new TypedIDBIndexSetup<DbData, StoreNameList, StoreName>({
            ...this.upgradeData,
            [this.storeName]: {
                ...storeOption,
                index: {
                    ...storeOption['index'],
                    [this.indexName]: {
                        ...indexOption,
                        multiEntry: multiEntry
                    }
                }
            }
        }, this.storeName, this.indexName)
    }
}
*/
