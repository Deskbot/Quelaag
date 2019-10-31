import { IncomingMessage, ServerResponse } from "http";

export interface RequestHandler<M extends Middleware> {
    (req: IncomingMessage, res: ServerResponse, middleware: M): void
}

export interface RequestSideEffect<M extends Middleware> {
    (req: IncomingMessage, middlewares: M): void;
}

export interface RequestPredicate {
    (req: IncomingMessage): boolean | Promise<boolean>;
}

export interface Endpoint<M extends Middleware> {
    when: RequestPredicate;
    do: RequestHandler<M>;
}

export interface Observer<M extends Middleware> {
    when: RequestPredicate;
    do: RequestSideEffect<M>;
}

export type MiddlewareSpec = Record<string | number | symbol, (req?: IncomingMessage) => any>;

export type Middleware<M extends MiddlewareSpec = MiddlewareSpec> = {
    [N in keyof M]: () => ReturnType<M[N]>
};

export interface MiddlewareConstructor<M extends Middleware> {
    new(req: IncomingMessage): M;
    prototype?: Partial<M>;
}
