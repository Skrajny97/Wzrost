// A database (D1) as a handler sees it, with another request's write let in
// just before one of the handler's statements is done, as two requests at
// the same moment may meet (the code review: limits counted before the
// write, not in it, let both requests through). `pattern` names that
// statement by its SQL; `between` is the other write, done once, the first
// time such a statement runs on its own (run, first, all) or in a batch.
// The handler is called straight, with { request, env: { DB }, now }.
export function meanwhile(database, pattern, between) {
  let due = true;
  const once = async () => {
    if (!due) return;
    due = false;
    await between();
  };
  const wrap = (statement) => ({
    real: statement,
    bind: (...values) => wrap(statement.bind(...values)),
    run: async () => {
      await once();
      return statement.run();
    },
    first: async (...column) => {
      await once();
      return statement.first(...column);
    },
    all: async () => {
      await once();
      return statement.all();
    },
  });
  return {
    prepare: (sql) => (pattern.test(sql) ? wrap(database.prepare(sql)) : database.prepare(sql)),
    async batch(statements) {
      if (statements.some((statement) => statement?.real)) await once();
      return database.batch(statements.map((statement) => statement?.real ?? statement));
    },
    // Whether the other write came.
    get done() {
      return !due;
    },
  };
}

// A POST to the API as the worker passes it to a handler, for `cookie`.
export const posted = (path, cookie, body) =>
  new Request(`https://test.insightrpg.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(body),
  });
