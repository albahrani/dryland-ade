import { removeScopedTmp } from "../../cli/test/scoped-tmp.ts";

// Deletes the run's temp directory, with the app data and repos of every app the tests launched.
export default function teardown(): void {
  removeScopedTmp();
}
