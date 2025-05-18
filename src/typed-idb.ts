import * as E from "fp-ts/Either"
import * as T from "fp-ts/Task"
import * as TE from "fp-ts/TaskEither"
import { pipe, identity } from "fp-ts/function"
import * as OC from "./OnCallback"
import { KeyPath, Cast } from "boost-ts.types"

////////////////////////////////////////////////////////////////
// Database Scheme Types
////////////////////////////////////////////////////////////////

type KeyPathType<T> = KeyPath<T, ".", false, IDBValidKey>
type StrKey<T> = Extract<keyof T, string>

export type UserDataType = {
    [storeName:string]:unknown
}


type IndexScheme<StoreData, UserKeyPath=KeyPathType<StoreData>> = {
    keyPath: StrKey<UserKeyPath>,
    options: {
        unique: boolean
        multiEntry: boolean
        locale: string|"auto"|null|undefined
    }
}

type StoreObjectScheme<StoreData, UserKeyPath = KeyPathType<StoreData>> = [ UserKeyPath ] extends [ Record<string,unknown> ] ? {
    keyPath: StrKey<UserKeyPath> | undefined,
    autoIncrement: boolean,
    indexes: {
        [indexName:string]: IndexScheme<UserKeyPath>
    }           
} : {
    keyPath: undefined,    
    autoIncrement: boolean,
    indexes: {}
}

export type DatabaseScheme<T extends UserDataType> = {
    [storeName in StrKey<T>]: StoreObjectScheme<T[storeName]>
}

////////////////////////////////////////////////////////////////
// Upgrade Database Scheme
////////////////////////////////////////////////////////////////

function isSameIndex<UserKeyPath extends Record<string,IDBValidKey>>(index:IDBIndex, config:IndexScheme<UserKeyPath>): boolean {
    // NOTE: Ignore "locale" and "isAutoLocale" properties because they may not be implemented
    return (index.keyPath === config.keyPath) && (index.unique === config.options.unique) && (index.multiEntry === config.options.multiEntry)
}

function upgradeIndexScheme<UserKeyPath extends Record<string,IDBValidKey>>(store:IDBObjectStore, name:string, config:IndexScheme<UserKeyPath>): IDBIndex {
    try {
        const index = store.index(name)    
        if (isSameIndex<UserKeyPath>(index, config)) {
            return index
        }
        else {
            store.deleteIndex(name)
        }
    }  
    catch (e) {
        if (!((e instanceof DOMException) && (e.name === "NotFoundError"))) {
            throw e    
        }
    }
    return store.createIndex(name, config.keyPath as string, config.options)
}

function upgradeStoreScheme<T extends UserDataType, StoreName extends StrKey<T>>(db:IDBDatabase, name: StoreName, scheme:StoreObjectScheme<T[StoreName]>): IDBObjectStore {

    try {
        const store = db.transaction(name, "readonly").objectStore(name)        
        if ((store.keyPath === scheme.keyPath) || (store.autoIncrement === scheme.autoIncrement)) {
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
    return db.createObjectStore(name, scheme)
}


function entries<T extends Record<string,any>>(obj: T):[StrKey<T>, T[keyof T]][] {
    return Object.entries(obj) as [StrKey<T>, T[keyof T]][]
}


function upgradeDatabaseScheme<T extends UserDataType>(dbScheme:DatabaseScheme<T>) {

    return async (db: IDBDatabase):Promise<void> => {            
        for (const [storeName, storeScheme] of entries(dbScheme)) {
            
            const store = upgradeStoreScheme<T, typeof storeName>(db, storeName, storeScheme)
                        
            for (const [indexName, indexScheme] of entries(storeScheme.indexes)) {            
                upgradeIndexScheme(store, indexName, indexScheme)
            }            
        }
    }
}

function onUpgradeNeededCB<T extends UserDataType>(dbConfig:DatabaseScheme<T>) {

    return async (event:IDBVersionChangeEvent) => await pipe(                    
        TE.Do,            
        TE.bind("req", ()=>TE.fromNullable("IDBOpenDBRequest is null")(event.target as IDBOpenDBRequest | null)),        
        TE.bind("db", ({req})=>TE.of(req.result)), 
        TE.tapTask(({db})=>()=>upgradeDatabaseScheme<T>(dbConfig)(db)),
        // TE.map(({db})=>db)
        TE.map(({req})=>req)
    )()
}

////////////////////////////////////////////////////////////////
// IDBFactory Typed Thin Wrapper
////////////////////////////////////////////////////////////////

export class FpIDBFactory<T extends UserDataType> {

    private readonly factory:IDBFactory = indexedDB

    constructor(private readonly scheme:DatabaseScheme<T>) {}
          
    open(name:string, version:number|undefined = undefined) {
        return pipe(
            TE.fromNullable("IDBFactory.open() returns null")(indexedDB.open(name, version)),
            TE.chainW((req)=>OC.taskify(req, {
                ...OC.defaultSet,                
                onupgradeneeded: onUpgradeNeededCB(this.scheme),
                // onsuccess: (_e)=>req.result,           
                onsuccess: (_e)=>req,           
                onblocked: OC.failureCallback
            })),
            // TE.map((db)=>new FpIDBDatabase<T, typeof this.scheme>(db.result, this.scheme))
            TE.chainTaskK((newReq)=>getIDBRequestTask<T, typeof this.scheme, FpIDBDatabase<T, typeof this.scheme>>(newReq, this.scheme, (db)=>new FpIDBDatabase<T, typeof this.scheme>(db, this.scheme)))
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

export function getIDBRequestTask<T extends UserDataType, Scheme extends DatabaseScheme<T>, ResultType>(
    request:IDBRequest,
    scheme:Scheme,
    resultWrapper:(result:any, scheme:Scheme)=>ResultType 
) {

    class FpIDBRequest<Scheme, ResultType>  {

        constructor(
            private readonly request:IDBRequest,
            private readonly scheme:Scheme,
            private readonly resultWrapper:(result:any, scheme:Scheme)=>ResultType        
            ) {}
    
        get result() {        
            return this.resultWrapper(this.request.result, this.scheme)
        }        
    }

    return pipe(                
        TE.fromEither(E.fromNullable("Not error")(request.transaction)),
        TE.chainW((txn)=>OC.taskify(txn, OC.defaultSet)),        
        TE.getOrElseW((_)=>async()=>null),                
        T.map((_)=>new FpIDBRequest(request, scheme, resultWrapper))        
    )
}   


class FpIDBDatabase<T extends UserDataType, Scheme extends DatabaseScheme<T>> {

    constructor(
        private readonly db:IDBDatabase,
        private readonly scheme:Scheme
    ){ }

    transaction(
        storeNames: StrKey<T> | StrKey<T>[],
        mode: "readonly"|"readwrite"|undefined = undefined,
        options: {
            durability: "default"|"strict"|"relaxed"
        }
    ) {        
        return pipe(
            E.tryCatch(()=>this.db.transaction(storeNames, mode, options), identity),
            TE.fromEither,            
            TE.map((trx)=>new FpIDBTransaction<T,typeof this.scheme>(trx, this.scheme))
        )
    }

    close():void {        
        this.db.close()
    }    
}

class FpIDBTransaction<T extends UserDataType, Scheme extends DatabaseScheme<T>> {

    public readonly done:TE.TaskEither<[string, string], Event>

    constructor(
        private readonly trx:IDBTransaction,
        private readonly scheme:Scheme
    ) {
        this.done = OC.taskify(this.trx, OC.defaultSet)
    }

    objectStore<StoreName extends StrKey<T>>(name:StoreName) {
        return pipe(
            E.tryCatch<DOMException, IDBObjectStore>(()=>this.trx.objectStore(name), identity as any),            
            E.map((store)=>new FpIDBObjectStore<T, Scheme, StoreName>(store, this.scheme[name]))
        )
    }  
}    

class FpIDBObjectStore<T extends UserDataType, Scheme extends DatabaseScheme<T>, StoreName extends StrKey<T>> {

    constructor(
        private readonly store:IDBObjectStore,
        private readonly scheme:Scheme[StoreName]       
    ) {}
    
    add(value:T[StoreName]): IDBRequest
    add(value:T[StoreName], key:(typeof this.scheme extends { keyPath:undefined } ? IDBValidKey : typeof this.scheme extends { keyPath:any } ? never : IDBValidKey) | never): IDBRequest
    add(value:T[StoreName], key:any=undefined): any {
        if (key === undefined) {
            this.store.add(value)
        }
        else {
            this.store.add(value, key)
        }
    }
/*
    hehe(pp:keyof KeyPathType<T[StoreName]>, value:KeyPathType<T[StoreName]>[typeof pp]):void {

    }
*/    
}

////////////////////////////////////////////////////////////////
// IDBFactory Wrapper
////////////////////////////////////////////////////////////////

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

/*
class TypedIDBIndex {
    constructor(
        private readonly idbIndex: IDBIndex
    ) {}

    count() {
        return OC.taskify(this.idbIndex.count(), OC.defaultSet)
    }
}
*/

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



