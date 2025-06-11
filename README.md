[_]:- vim: set ts=2 et sw=2 sts=2 fileencoding=utf-8 fileformat=unix:

[:Author]:-    ryokat3@gmail.com
[:Date]:-      2025-06-10

# typed-idb

<!------------------------ Introduction ------------------------>

indexed DB library with following feature:

- API with strong type inference
  - To input **correct** parameter to API

- API based on functional programming [fp-ts][fp-ts]
  - To use Indexed DB without side-effects

- 2 types of API sets:
  - Customizable Low-level API for Indexed DB experts
  - Easy-to-use High-level API for Indexed DB novices


<!------------------------ External References ------------------------>
## Resources / References

- [{JSON}Placeholder](https://jsonplaceholder.typicode.com/) from which fake JSON test data is downloaded
- [fp-ts chain example for StateReaderEitherTask](https://github.com/gcanti/fp-ts/issues/1183)
- [Understanding IndexedDB. The complete guide (blog)](https://blog.xnim.me/indexeddb-guide)

[fp-ts]: https://github.com/gcanti/fp-ts/
