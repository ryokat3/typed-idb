import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import { pipe } from "fp-ts/function"
import * as OC from "./OnCallback"
import { KeyPath, Cast } from "boost-ts.types"

////////////////////////////////////////////////////////////////
// Database Types
////////////////////////////////////////////////////////////////

type KeyPathType<T> = T extends Record<string,unknown> ? KeyPath<T, ".", false> : never

type IndexDataType<T> = T extends Record<string,unknown> ? {
    keyPath: keyof KeyPathType<T>,
    options: {
        unique: boolean
        multiEntry: boolean
        locale: string|"auto"|null|undefined
    }
} : null

type StoreDataType<T> = T extends Record<string, unknown> ? {
    keyPath: keyof KeyPathType<T> | undefined,
    Indexes: Array<IndexDataType<T>>
} : null

export type DatabaseDataType<T extends Record<string,unknown>> = {
    [K in keyof T]: StoreDataType<T[K]>
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



