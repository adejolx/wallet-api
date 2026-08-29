# Day 2 — Model the wallet domain

## Why this is next

Day 1 leaves the project with a testable Express application, a validated port,
a health endpoint, and a consistent error path. Before adding another HTTP
route, isolate the first business rule from Express so it can be understood and
tested on its own.

Today's goal is to model **money and a wallet balance** without persistence or
controllers. Do not add a database, authentication, transfers, or a route yet.

## Learning outcomes

By the end of the exercise, you should be able to:

- explain why monetary values should not be represented as floating-point major
  units such as `10.99`;
- keep domain rules independent from HTTP concerns;
- use tests to discover boundary cases; and
- distinguish invalid input from a valid operation that cannot be completed.

## Your task

Create a small wallet domain module, choosing the file and API names yourself.
Represent an amount as an **integer number of minor units** (for example, cents).
The module should support crediting and debiting one wallet while enforcing the
following invariants:

1. A wallet balance starts at zero and never becomes negative.
2. An amount must be a positive, safe integer.
3. A debit larger than the available balance is rejected.
4. A rejected operation leaves the balance unchanged.

Keep the first version intentionally narrow: one currency, one in-memory wallet,
and synchronous operations are enough.

## Work in small loops

1. **Write one failing test** for a new wallet's balance.
2. Add only enough domain code to make it pass.
3. Write a failing test for a valid credit, then implement it.
4. Repeat for a valid debit.
5. Add boundary tests one at a time: zero, a negative value, a fraction,
   `Number.NaN`, an unsafe integer, and insufficient funds.
6. Run the full suite after each green test so Day 1 behavior remains intact.

Suggested checks:

```bash
npm test -- --run
npm run type:check
npm run build
```

## Definition of done

- Domain code does not import Express or refer to requests/status codes.
- Tests demonstrate all four invariants, including unchanged state after a
  failed operation.
- The existing health and unknown-route tests still pass.
- Type checking and the production build succeed.
- You can explain whether your chosen API exposes mutable state and why.

## Hints — reveal only when stuck

<details>
<summary>Hint 1: where should validation live?</summary>

Put the rule close to the state it protects. A private helper or a small value
object are both reasonable at this stage; pick the simpler design you can test.

</details>

<details>
<summary>Hint 2: how do I validate an amount?</summary>

Look at `Number.isSafeInteger`. Combine it with a positivity check. Write tests
before deciding the exact error type.

</details>

<details>
<summary>Hint 3: how do I prevent partial mutation?</summary>

Perform every validation and funds check before assigning the next balance.
Then assert the old balance in the test that expects the operation to fail.

</details>

<details>
<summary>Hint 4: should I reuse AppError?</summary>

Not yet. `AppError` currently carries an HTTP status, while this exercise is
about a transport-independent domain. First express the domain failure without
HTTP, then map it at the application boundary on a later day.

</details>

## Reflection before Day 3

Write down short answers to these questions in your own notes:

1. What bug could arise from storing dollars as a floating-point number?
2. Which invariant belongs to an amount, and which belongs to a wallet?
3. What would have to change to support multiple currencies safely?
4. Which error will eventually map to a client response, and where should that
   mapping happen?

Stop here rather than exposing the wallet over HTTP. That separation is the
point of today's exercise.
