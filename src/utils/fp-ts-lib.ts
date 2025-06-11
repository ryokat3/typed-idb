import * as E from "fp-ts/Either"
import * as TE from "fp-ts/TaskEither"
import * as SRTE from "fp-ts/StateReaderTaskEither"
import { pipe } from "fp-ts/function"

export function EA_reduce<E, A, B>(aryE: E.Either<E, A>[], f: (b: B, a: A) => B, curE: E.Either<E, B>): E.Either<E, B> {
    if (aryE.length === 0) {
        return curE
    }
    else {
        return pipe(
            E.Do,
            E.bind("acc", () => curE),
            E.bind("cur", () => aryE[0]),
            E.chain(({ acc, cur }) => EA_reduce(aryE.slice(1), f, E.right(f(acc, cur))))
        )
    }
}


export const SRTE_chainWithContext_orig = <S, R, E, A, B>(f: (a: A, r: R, s: S) => TE.TaskEither<E, [B, S]>) => (
    ma: SRTE.StateReaderTaskEither<S, R, E, A>
): SRTE.StateReaderTaskEither<S, R, E, B> => (s1) => (r) =>
    pipe(
        ma(s1)(r),
        TE.chain(([a, s2]) => f(a, r, s2))
    )

export const SRTE_chainWithContext = <S, R, E, A, B, S2>(f: (a: A, r: R, s: S) => TE.TaskEither<E, [B, S2]>) => (
    ma: SRTE.StateReaderTaskEither<S, R, E, A>
): SRTE.StateReaderTaskEither<S2, R, E, B> => (s1) => (r) =>
    pipe(
        ma(s1 as any)(r),
        TE.chain(([a, s2]) => f(a, r, s2))
    )