// <!-- vim: set ts=4 et sw=4 sts=4 fileencoding=utf-8 fileformat=unix: -->
import { TypedIDBBuilder } from "../src/typed-idb"
import * as chai from "chai"
import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import { pipe } from "fp-ts/function"

// import comments from "./comments.json"
// import photos from "./photos.json"

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

export const sleepTask = (ms:number) => ()=>new Promise((res)=>setTimeout(res, ms))

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
    /*
    it("cont2", async function() {
        const title = this.test?.titlePath()?.join("::")
        console.log(title)
        const dbName: string = title || window.crypto.randomUUID()

        const builder = TypedIDBBuilder<IdbData>().objectStore("store1", "key1.key2").objectStore("store2", "value")

        const hehe = builder.client(
            (stores)=>{
                return pipe(
                    TE.fromIO(()=>stores["store1"].add(data1_1)),
                    TE.chain((req)=>req.cont(()=>stores["store1"].add(data1_2))),
                    TE.chain((req)=>req.cont(()=>stores["store1"].get("hello"))),
                    TE.chain((req)=>req.cont(()=>stores["store1"].get("hello")))
                )                
            }            
        )

        const result = await pipe(            
            TE.of(builder.factory()),
            TE.chain((factory) => factory.open(dbName)),                        
            TE.chainW((req) => req.result),
            TE.chain((db) => db.transaction(["store1", "store2"], "readwrite", { durability: "default" })),
            TE.chainW((txn) => TE.fromEither(txn.objectStore("store1"))),
            TE.tap((store)=>pipe(
                TE.fromIO(()=>store.add(data1_1)),
                TE.chain((req)=>req.cont(()=>store.add(data1_2))),
                TE.chain((req)=>req.cont(()=>store.get("hello"))),
                TE.chain((req)=>req.cont(()=>store.get("hello")))
            )),
        )()   

        chai.assert.isTrue(E.isRight(result))        
    })   
    */    
})

/*
describe("typed-idb", ()=>{   

    describe("database lifecycle", () => {

        it("create, open, close, delete", async function () {

            const dbName:string = this.currentTest?.titlePath()?.join("::") || window.crypto.randomUUID()

            const result = await pipe(
                TE.of(startTypedIDB<IdbData>().store("store1").autoIncrement(false).keyPath("key1.key2").store("store2").keyPath("value").createFactory(dbName, 1)),
                TE.chain((factory) => factory.openDb()),
                TE.tapIO((idb) => () => idb.close()),
                TE.chainW((idb) => idb.delete()),
                TE.tapError((e) => TE.of(console.log(e.toString())))
            )()
            chai.assert.isTrue(E.isRight(result))
        })
    })

    describe("key path", ()=>{    
        it("add, get (single key)", async function () {

            const dbName: string = this.currentTest?.titlePath()?.join("::") || window.crypto.randomUUID()

            const result = await pipe(
                TE.Do,
                TE.bind("factory", () => TE.right(startTypedIDB<IdbData>().store("store1").autoIncrement(false).keyPath("key1.key2").store("store2").autoIncrement(false).keyPath("value").createFactory(dbName, 1))),
                TE.bind("idb", ({ factory }) => factory.openDb()),
                TE.bindW("store", ({ idb }) => TE.right(idb.getStore("store2"))),
                TE.tap(({ store }) => store.add({ "value": 5 })),
                TE.bindW("data", ({ store }) => store.get(5)),
                TE.tapIO(({ data }) => () => console.log(data)),
                TE.tapIO(({ data }) => () => chai.assert.isTrue(data.value == 5)),
                TE.tapIO(({ idb }) => () => idb.close()),
                TE.tap(({ idb }) => idb.delete()),
                TE.tapError((e) => TE.of(console.log(e.toString())))
            )()
            chai.assert.isTrue(E.isRight(result))

        })

        it("add, get (multiple keys)", async function () {

            const dbName: string = this.currentTest?.titlePath()?.join("::") || window.crypto.randomUUID()

            const result = await pipe(
                TE.Do,
                TE.bind("factory", () => TE.right(startTypedIDB<IdbData>().store("store1").autoIncrement(false).keyPath("key1.key2").store("store2").keyPath("value").createFactory(dbName, 1))),
                TE.bind("idb", ({ factory }) => factory.openDb()),
                TE.bindW("store", ({ idb }) => TE.right(idb.getStore("store1"))),
                TE.tap(({ store }) => store.add(data1_1)),
                TE.tap(({ store }) => store.add(data1_2)),
                TE.bindW("data", ({ store }) => store.get("hello")),
                TE.tapIO(({ data }) => () => chai.assert.isTrue(data.key1.key2 == "hello")),
                TE.tapIO(({ idb }) => () => idb.close()),
                TE.tap(({ idb }) => idb.delete()),
                TE.tapError((e) => TE.of(console.log(e.toString())))
            )()
            chai.assert.isTrue(E.isRight(result))

        })
    })
})

describe("type restriction", ()=>{

    it("restrict non-exist store", ()=>{
        // @ts-expect-error
        // Argument of type '"non-exist"' is not assignable to parameter of type '"store1" | "store2"'.
        startTypedIDB<IdbData>().store("non-exist")
    })

    it("restrict multiple store call", ()=>{
        // @ts-expect-error
        // Argument of type '"store1"' is not assignable to parameter of type '"store2"'.
        startTypedIDB<IdbData>().store("store1").store("store1")
    })

    it("must call for all stores", ()=>{
        // @ts-expect-error
        // 'factory' is declared but its value is never read.
        const factory = startTypedIDB<IdbData>().store("store1").createFactory("hello", 3)
    })

    it("invalid keyPath", ()=>{
        
        // @ts-expect-error
        //
        // Argument of type '["key1", "key3"]' is not assignable to parameter of type '"key3" | ["key1", "key2"]'.
        // Type '["key1", "key3"]' is not assignable to type '["key1", "key2"]'.
        // Type at position 1 in source is not compatible with type at position 1 in target.
        // Type '"key3"' is not assignable to type '"key2"'.ts(2345)
        startTypedIDB<IdbData>().store("store1").keyPath(["key1", "key3"])
    })
})
*/

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
