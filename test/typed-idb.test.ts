// <!-- vim: set ts=4 et sw=4 sts=4 fileencoding=utf-8 fileformat=unix: -->
import { startTypedIDB } from "../src/typed-idb"
import { FpIDBFactory, DatabaseScheme } from "../src/typed-idb"
import * as chai from "chai"
import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import { pipe } from "fp-ts/function"

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


const IdbScheme:DatabaseScheme<IdbData> = {
    "store1": {
        keyPath: "key1.key2",
        autoIncrement: false,
        indexes: {
            "iname1": {
                keyPath: "key3",
                options: {
                    unique: false,
                    multiEntry: false,
                    locale: null
                }
            }
        }
    },
    "store2": {
        keyPath: "value",
        autoIncrement: true,
        indexes: {}
    }
}
export const sleepTask = (ms:number) => ()=>new Promise((res)=>setTimeout(res, ms))

describe("IndexedDB TaskEither", function () {

    describe("FpIDBFactory", function () {

        it("open/delete", async function () {                    
            const title = this.test?.titlePath()?.join("::")
            console.log(title)
            const dbName: string = title || window.crypto.randomUUID()

            const result = await pipe(
                TE.Do,
                TE.bind("factory", () => TE.right(new FpIDBFactory<IdbData>(IdbScheme))),    
                TE.bind("db", ({factory}) => factory.open(dbName)),                
                TE.tap(({factory}) => factory.deleteDatabase(dbName))
            )()

            chai.assert.isTrue(E.isRight(result))
        })
    })

    describe("FpIDBDatabase", function () {    

        it("database", async function () {
            const title = this.test?.titlePath()?.join("::")
            console.log(title)
            const dbName: string = title || window.crypto.randomUUID()            

            const result = await pipe(
                TE.Do,                
                TE.apS("factory", TE.of(new FpIDBFactory<IdbData>(IdbScheme))),                
                // TE.bind("db", ({factory}) => factory.open(dbName)),                          
/* New */       TE.bind("req", ({factory}) => factory.open(dbName)),
/* New */       TE.bindW("db", ({req}) => TE.of(req.result)),
                TE.bind("databases", ({factory}) => factory.databases()),                               
                TE.tapIO(({databases}) => () => chai.expect(databases.length).to.be.above(0)),
                TE.tapIO(({databases}) => () => chai.assert.isTrue(databases.map((x)=>x.name).includes(dbName))),                
                TE.tapIO(({db}) => () => db.close()),             
                TE.tapIO(() => () => console.log("Delete DB")),  
                TE.tap(({factory}) => factory.deleteDatabase(dbName)),
                TE.tapIO(() => () => console.log("Delete DB done")),                
                TE.bind("databases2", ({factory}) => factory.databases()),                               
                TE.tapIO(({databases2}) => () => chai.assert.isFalse(databases2.map((x)=>x.name).includes(dbName)))                
            )()

            chai.assert.isTrue(E.isRight(result))
        })
    })
})

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
