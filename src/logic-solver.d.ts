// Ambient type declarations for the `logic-solver` npm package (CommonJS,
// no bundled types). Its entry point does `module.exports = Logic`, so we use
// the classic class + namespace merge with `export =`, which lets consumers
// write `import Logic from 'logic-solver'` and access types via `Logic.Term`,
// `Logic.Solver`, `Logic.Solution`, etc.

declare module 'logic-solver' {
    namespace Logic {
        /** A boolean term: a variable name/number, optionally negated (e.g. "-foo"), or a nested structure. */
        type Term = string | number | boolean | Term[] | VarList

        interface VarList {
            trueVars?: Term[]
            falseVars?: Term[]
        }

        /** A satisfying assignment returned by `Solver#solve`. */
        interface Solution {
            getMap(): Record<string, boolean>
            getTrueVars(): string[]
            getFalseVars(): string[]
            getUnknownVars(): string[]
            getFormula(): Term[]
            evaluate(expression: Term): boolean
            getWeightedSum(formulas: Term[], weights: number[] | number): number
            ignoreUnknownVariables(): void
        }

        interface Solver {
            require(...args: Term[]): void
            forbid(...args: Term[]): void
            solve(): Solution | null
            solveAssuming(assumption: Term): Solution | null
            getVarNum(variableName: string, noCreate?: boolean): number
            getVarName(variableNum: number): string
            toNameTerm(term: Term): string
            toNumTerm(term: Term, noCreate?: boolean): number
        }

        /** An integer expression (a vector of bits), e.g. from `weightedSum` or `constantBits`. */
        interface Bits { }
    }

    const Logic: {
        new(): Logic.Solver
        Solver: { new(): Logic.Solver }
        Bits: { new(formulas: Logic.Term[]): Logic.Bits }

        FALSE: Logic.Term
        TRUE: Logic.Term

        not(operand: Logic.Term): Logic.Term
        or(...operands: Logic.Term[]): Logic.Term
        and(...operands: Logic.Term[]): Logic.Term
        xor(...operands: Logic.Term[]): Logic.Term
        implies(a: Logic.Term, b: Logic.Term): Logic.Term
        equiv(a: Logic.Term, b: Logic.Term): Logic.Term
        exactlyOne(...operands: Logic.Term[]): Logic.Term
        atMostOne(...operands: Logic.Term[]): Logic.Term

        constantBits(wholeNumber: number): Logic.Bits
        variableBits(baseName: string, n: number): Logic.Bits
        equalBits(a: Logic.Bits, b: Logic.Bits): Logic.Term
        lessThan(a: Logic.Bits, b: Logic.Bits): Logic.Term
        lessThanOrEqual(a: Logic.Bits, b: Logic.Bits): Logic.Term
        greaterThan(a: Logic.Bits, b: Logic.Bits): Logic.Term
        greaterThanOrEqual(a: Logic.Bits, b: Logic.Bits): Logic.Term
        sum(...operands: Logic.Term[]): Logic.Bits
        weightedSum(formulas: Logic.Term[], weights: number[] | number): Logic.Bits

        disablingAssertions(fn: () => void): void
        isTerm(value: unknown): value is Logic.Term
        isNameTerm(value: unknown): value is string
        isNumTerm(value: unknown): value is number
        isFormula(value: unknown): boolean
    }

    export = Logic
}
