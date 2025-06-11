// <!-- vim: set ts=4 et sw=4 sts=4 fileencoding=utf-8 fileformat=unix: -->
import { TypedIDBBuilder, /* TypedIDBRequest, */ TransactionStoreType, TypedIDBRequestChain3 } from "../src/typed-idb"
import { SRTE_chainWithContext } from "../src/utils/fp-ts-lib"
import * as chai from "chai"
import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import * as SRTE from "fp-ts/StateReaderTaskEither"
import { pipe } from "fp-ts/function"


import comments from "./comments.json"

type CommentsType = {
    "comments": {
        postId: number;
        id: number;
        name: string;
        email: string;
        body: string;
    }
} 

type IdbData = {
    "store1": {
        "key1": {
            "key2": string
        },
        "key3": number
    },
    "store2": {
        "value": number
    }
}

const data1_1:IdbData["store1"] = {
    "key1": {
        "key2": "hello"
    },
    "key3": 5    
}

const data1_2:IdbData["store1"] = {
    "key1": {
        "key2": "world"
    },
    "key3": 5
}

const data2_1:IdbData["store2"] = {
    "value": 100
}

describe("TypedIDBBuilder", function(){

    it("store name check", function() {
        // No ERROR
        TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2")

        // @ts-expect-error
        // storeName must be a key of IdbDatra
        TypedIDBBuilder<IdbData>().objectStore("store1_error", "key1.key2")        
    })

    it("key path check", function() {
        // No ERROR
        TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2")

        // @ts-expect-error
        // The value type of keyPath must be IDBValidType
        TypedIDBBuilder<IdbData>().objectStore("store1", "key1")

        // @ts-expect-error         
        // keyPath must conform to IdbDatra
        TypedIDBBuilder<IdbData>().objectStore("store1", "key2")                    
    })

    it("factory", function() {        
        chai.assert.isObject(TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value").factory())
    })    
})

describe("TypedIDBFactory", function () {

    it("open/delete", async function () {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const result = await pipe(
            TE.Do,
            TE.bind("factory", () => TE.right(TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value").factory())),
            TE.bind("db", ({ factory }) => factory.open(dbName)),
            TE.tap(({ factory }) => factory.deleteDatabase(dbName))
        )()

        chai.assert.isTrue(E.isRight(result))
    })
})

describe("TypedIDBDatabase", function () {

    it("database", async function () {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const result = await pipe(
            TE.Do,
            TE.apS("factory", TE.of(TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value").factory())),
            TE.bind("dbreq", ({ factory }) => factory.open(dbName)),            
            TE.bindW("db", ({ dbreq }) => dbreq.result),            
            TE.bind("databases", ({ factory }) => factory.databases()),
            TE.tapIO(({ databases }) => () => chai.expect(databases.length).to.be.above(0)),
            TE.tapIO(({ databases }) => () => chai.assert.isTrue(databases.map((x) => x.name).includes(dbName))),
            TE.tapIO(({ db }) => () => db.close()),
            TE.tapIO(() => () => console.log("Delete DB")),
            TE.tap(({ factory }) => factory.deleteDatabase(dbName)),
            TE.tapIO(() => () => console.log("Delete DB done")),
            TE.bind("databases2", ({ factory }) => factory.databases()),
            TE.tapIO(({ databases2 }) => () => chai.assert.isFalse(databases2.map((x) => x.name).includes(dbName)))
        )()

        chai.assert.isTrue(E.isRight(result))
    })
})

describe("TypedIDBTransaction", function () {

    it("transaction", async function () {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const result = await pipe(
            TE.Do,
            TE.apS("factory", TE.of(TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value").factory())),
            TE.bind("dbreq", ({ factory }) => factory.open(dbName)),            
            TE.bindW("db", ({ dbreq }) => dbreq.result),            
            TE.bindW("txn", ({ db }) => db.transaction(["store1", "store2"], "readwrite", { durability: "default" })),
            TE.bindW("store", ({ txn }) => TE.fromEither(txn.objectStore("store1"))),
            TE.tapIO(({ db }) => () => db.close()),
            TE.tap(({ factory }) => factory.deleteDatabase(dbName))
        )()

        chai.assert.isTrue(E.isRight(result))
    })
})

describe("TypedIDBObjectStore", function () {

    it("cont", async function () {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const result = await pipe(
            TE.Do,
            TE.apS("factory", TE.of(TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value").factory())),
            TE.bind("dbreq", ({ factory }) => factory.open(dbName)),                        
            TE.bindW("db", ({ dbreq }) => dbreq.result),                        
            TE.bindW("txn", ({ db }) => db.transaction(["store1", "store2"], "readwrite", { durability: "default" })),
            TE.bindW("store", ({ txn }) => TE.fromEither(txn.objectStore("store1"))),
            TE.bind("req1", ({store})=>TE.fromIO(()=>store.add(data1_1))),
            TE.tapIO(() => () => console.log("after req1")),
            TE.bind("req2", ({store, req1})=>req1.cont(()=>store.add(data1_2))),
            TE.tapIO(() => () => console.log("after req2")),
            TE.bind("req3", ({store, req2})=>req2.cont(()=>store.get("hello"))),
            TE.tapIO(() => () => console.log("after req3")),                        
            TE.bind("req4", ({store, req3})=>req3.cont(()=>store.get("hello"))),            
            TE.tapIO(() => () => console.log("after req4")),
            TE.tapIO(({req3}) => async () => console.log(await req3.result())),
            TE.tapIO(({req4}) => async () => console.log(await req4.result())),
            TE.tapIO(({ db }) => () => db.close()),
            TE.tap(({ factory }) => factory.deleteDatabase(dbName))
        )()

        chai.assert.isTrue(E.isRight(result))
    })
})


describe("TIDBDatabase", function () {    

    it("single store", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = await TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")
        const database = await builder.connect(dbName)  
        
        if (database !== undefined) {
            const transaction = database.transaction("store1", "readwrite", { durability: "default" })

            const callback = async (store: TransactionStoreType<typeof transaction>) => {
                const result = await pipe(
                    TE.fromIO(() => store.add(data1_1)),
                    TE.tapIO(() => () => console.log('added data1_1')),
                    TE.chain((req) => req.cont(() => store.add(data1_2))),
                    TE.tapIO(() => () => console.log('1 cb req finished')),
                    TE.chain((req) => req.cont(() => store.get("hello"))),
                    TE.tapIO(() => () => console.log('2 cb req finished')),
                    TE.chainW((req) => req.result),
                    TE.tapIO((data) => () => chai.assert.equal(data.key3, 5)),
                    TE.tapIO(() => () => console.log('callback finished')),
                    TE.getOrElseW((_) => async () => undefined)
                )()

                chai.assert.isDefined(result)

                return result
            }                   
            const result = await transaction(callback)
            console.log(`${title}: Result: ${JSON.stringify(result)}`)
            
            database.cleanup()            
        }
        builder.factory().deleteDatabase(dbName)        
    })
    
    it("multiple stores", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = await TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")
        const database = await builder.connect(dbName)            
        
        if (database !== undefined) {
            const transaction = database.transaction(["store1", "store2"], "readwrite", { durability: "default" })
    
            const callback = async (store: TransactionStoreType<typeof transaction>) => {

                const result = await pipe(
                    TE.fromIO(() => store["store1"].add(data1_1)),
                    TE.tapIO(() => () => console.log('multi store started 2')),
                    TE.chain((req) => req.cont(() => store["store1"].add(data1_2))),
                    TE.tapIO(() => () => console.log('multi store started 3')),
                    TE.chain((req) => req.cont(() => store["store2"].add(data2_1))),
                    TE.tapIO(() => () => console.log('multi store started 4')),
                    TE.chain((req) => req.cont(() => store["store2"].get(100))),
                    TE.tapIO(() => () => console.log('multi store started 5')),
                    TE.chain((req) => req.cont(() => store["store1"].get("hello"))),
                    TE.tapIO(() => () => console.log('multi store started 6')),
                    TE.chainW((req) => req.result),
                    TE.tapIO(() => () => console.log('multi store started 7')),
                    TE.tapIO((data) => () => chai.assert.equal(data.key3, 5)),
                    TE.tapIO((data) => () => console.log(`multi callback finished: ${JSON.stringify(data)}`)),
                    TE.getOrElseW((_) => async () => undefined)
                )()
                chai.assert.isDefined(result)

                return result
            }
            const result = await transaction(callback)
            console.log(`${title}: Result: ${JSON.stringify(result)}`)
            
            database.cleanup()            
        }
        builder.factory().deleteDatabase(dbName)
    })    

    it("single store TE", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = await TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")        
        
        const result = await pipe(
            TE.Do,
            TE.apS("builder", TE.of(builder)),
            TE.bind("database", ({builder})=>builder.connectTE(dbName)),
            TE.bind("trx", ({database})=>TE.of(database.transactionTE("store1", "readwrite", { durability: "default" }))),
            TE.bind("result", ({ trx }) => trx(async (store) => {
                const result = await pipe(
                    TE.fromIO(() => store.add(data1_1)),
                    TE.tapIO(() => () => console.log('added data1_1')),
                    TE.chain((req) => req.cont(() => store.add(data1_2))),
                    TE.tapIO(() => () => console.log('1 cb req finished')),
                    TE.chain((req) => req.cont(() => store.get("hello"))),
                    TE.tapIO(() => () => console.log('2 cb req finished')),
                    TE.chainW((req) => req.result),
                    TE.tapIO((data) => () => chai.assert.equal(data.key3, 5)),
                    TE.tapIO(() => () => console.log('callback finished'))
                )()
                chai.assert.isTrue(E.isRight(result))
                return result
            })),
            TE.tapIO(({result})=>async ()=>chai.assert.isTrue(E.isRight(await result))),
            TE.tapIO(({result})=>async ()=>console.log(`result: ${JSON.stringify(await result)}`)),
            TE.tapIO(({database})=>()=>database.cleanup()),
            TE.tapIO(({builder})=>()=>builder.factory().deleteDatabase(dbName))
        )()                    

        chai.assert.isTrue(E.isRight(result))        
    })    

    it("single store SRTE", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = await TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")        
        
        const result = await pipe(
            TE.Do,
            TE.apS("builder", TE.of(builder)),
            TE.bind("database", ({builder})=>builder.connectTE(dbName)),
            TE.bind("trx", ({database})=>TE.of(database.transactionTE("store1", "readwrite", { durability: "default" }))),
            TE.bind("result", ({ trx }) => trx(async (store) => {
                
                const req0 = store.add(data1_1)
                const result = await pipe(                                        
                    // SRTE.of<typeof req0, typeof store, unknown, unknown>((_r:typeof req0)=>(_s:typeof store)=>TE.of(undefined)),
                    // SRTE.of<TypedIDBRequest<void>, typeof store, unknown, unknown>(undefined),
                    SRTE.of<typeof req0, typeof store, unknown, unknown>(undefined),
                    SRTE_chainWithContext((_a, store, req)=>req.cont2(()=>store.add(data1_2))),  
                    SRTE.tapIO((data)=>()=>console.log(`SRTE out 1: ${JSON.stringify(data)}`)),
                    SRTE_chainWithContext((_a, store, req)=>req.cont2(()=>store.get("hello"))),
                    SRTE.tapIO((data)=>()=>console.log(`SRTE out 2: ${JSON.stringify(data)}`)),
                    SRTE_chainWithContext((_a, _store, req)=>req.cont2(()=>req)),
                    SRTE.tapIO((data)=>()=>console.log(`SRTE out: ${JSON.stringify(data)}`))
                )(req0 as any)(store)()

                return result                
            })),
            TE.tapIO(({result})=>async ()=>console.log(`result from outer loop: ${JSON.stringify(await result)}`)),
            TE.tapIO(({database})=>()=>database.cleanup()),
            TE.tapIO(({builder})=>()=>builder.factory().deleteDatabase(dbName))
        )()                    

        chai.assert.isTrue(E.isRight(result))        
    })    

    it("TypedIDBRequestChain", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = await TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")        
        
        const result = await pipe(
            TE.Do,
            TE.apS("builder", TE.of(builder)),
            TE.bind("database", ({builder})=>builder.connectTE(dbName)),
            TE.bind("trx", ({database})=>TE.of(database.transactionTE("store1", "readwrite", { durability: "default" }))),
            TE.bind("result", ({ trx }) => trx(async (store) => {
                
                const req0 = store.add(data1_1)
                const result = await pipe(                                                            
                    SRTE.of<typeof req0, typeof store, unknown, unknown>(undefined), 
                    SRTE.tapIO((data)=>()=>console.log(`chain out 1: ${JSON.stringify(data)}`)),                   
                    TypedIDBRequestChain3((a, store)=>{ console.log(`adding data1_2: ${a}`); return store.add(data1_2) }),                                        
                    SRTE.tapIO((data)=>()=>console.log(`chain out 2: ${JSON.stringify(data)}`)),                   
                    TypedIDBRequestChain3((_, store)=>store.get("hello")),
                    SRTE.tapIO((data)=>()=>console.log(`chain out 3: ${JSON.stringify(data)}`)),                   
                    TypedIDBRequestChain3((a, _store)=>{ console.log(`last nop: ${JSON.stringify(a)}`); return req0 }),
                    SRTE.tapIO((data)=>()=>console.log(`chain out 4: ${JSON.stringify(data)}`)),                   
                )(req0)(store)()

                return result                
            })),
            TE.tapIO(({result})=>async ()=>console.log(`result from outer loop: ${JSON.stringify(await result)}`)),
            TE.tapIO(({database})=>()=>database.cleanup()),
            TE.tapIO(({builder})=>()=>builder.factory().deleteDatabase(dbName))
        )()                    

        chai.assert.isTrue(E.isRight(result))        
    })  

    it("addArray", async function () {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()


        const builder = await TypedIDBBuilder<CommentsType>().objectStore("comments", "id")

        const result = await pipe(
            TE.Do,
            TE.apS("builder", TE.of(builder)),
            TE.bind("database", ({ builder }) => builder.connectTE(dbName)),
            TE.bind("trx", ({ database }) => TE.of(database.transactionTE("comments", "readwrite", { durability: "default" }))),
            TE.bind("result", ({ trx }) => trx(async (store) => {
                const result = await pipe(    
                    store.addArray(comments),
                    TE.chain((req) => req.cont(() => store.get(453))),
                    TE.chainW((req) => req.result)
                )()
                return result                    
            })),
            TE.tapIO(({ result }) => async () => console.log(`${title}: result from outer loop: ${JSON.stringify(await result)}`)),
            TE.tapIO(({ database }) => () => database.cleanup()),
            TE.tapIO(({ builder }) => () => builder.factory().deleteDatabase(dbName))
        )()

        chai.assert.isTrue(E.isRight(result))
    })
})


describe("IDBFactory", ()=>{
    describe("#open()", ()=>{
    })

    describe("#deleteDatabase()", ()=>{
    })

    describe("#cmp()", ()=>{
    })

    describe("#databases()", ()=>{
    })
})

describe("IDBOpenDBRequest", ()=>{
    describe("!blocked", ()=>{
    })
    
    describe("!upgradeneeded", ()=>{
    })
})

describe("IDBDatabase", ()=>{
    describe("#createObjectStore()", ()=>{
    })

    describe("#deleteObjectStore()", ()=>{
    })

    describe("#transaction()", ()=>{
    })

    describe("#close()", ()=>{
    })

    describe("!close", ()=>{
    })

    describe("!versionchange", ()=>{
    })

    describe("!abort", ()=>{
    })

    describe("!error", ()=>{
    })
})

describe("IDBTransaction", ()=>{
    describe("#db", ()=>{
    })

    describe("#durability", ()=>{
    })

    describe("#error", ()=>{
    })

    describe("#mode", ()=>{
    })

    describe("#objectStoreNames", ()=>{
    })

    describe("#abort()", ()=>{
    })

    describe("#objectStore()", ()=>{
    })

    describe("#commit()", ()=>{
    })

    describe("!abort", ()=>{
    })

    describe("!complete", ()=>{
    })

    describe("!error", ()=>{
    })
})

describe("IDBRequest", ()=>{
})

describe("IDBObjectStore", ()=>{
})

describe("IDBIndex", ()=>{
})

describe("IDBCursor", ()=>{
})

describe("IDBCursorWithValue", ()=>{
})

describe("IDBKeyRange", ()=>{
})

describe("IDBVersionChangeEvent", ()=>{
})
