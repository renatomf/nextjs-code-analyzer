/**
 * An error whose message is written for the end user (TD-33): it explains a
 * business rule or an input problem ("no JavaScript/TypeScript files", "plan
 * limit reached") and never carries internals. Anything that is not a
 * DomainError (database, network, provider, bug) must be replaced by a
 * generic message before reaching the user.
 *
 * Dependency-free on purpose: client-reachable modules can import it.
 */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
