import { Endpoint, Spy, Middleware, MiddlewareSpec, MiddlewareConstructor, FallbackEndpoint, RequestHandler, CatchHandler } from "./types";
import { IncomingMessage, ServerResponse } from "http";

export class Quelaag<
    Req = IncomingMessage,
    Res = ServerResponse,
    Spec extends MiddlewareSpec<any, Req> = any,
    M extends Middleware<Req, Spec> = Middleware<Req, Spec>
> {
    private catcher: ((error: any) => void) | undefined;
    private endpoints: Endpoint<M, Req, Res>[];
    private fallbackEndpoint: FallbackEndpoint<M, Req, Res> | undefined;
    private MiddlewareInventory: MiddlewareConstructor<M, Req>;
    private spies: Spy<M, Req>[];

    /**
     * The symbol that is the key for the request object hidden in the middleware object.
     */
    public static readonly __req = Symbol('request key');

    /**
     * Create a Quelaag web server handler.
     * @param middlewareSpec Define middleware.
     * @param catcher Respond to an error that occurs anywhere within endpoints, spies, and middleware.
     *                The `this` parameter of the function will be stripped.
     */
    constructor(middlewareSpec: Spec, catcher?: (error: any) => void) {
        this.catcher = catcher;
        this.endpoints = [];
        this.spies = [];

        this.MiddlewareInventory = this.middlewareSpecToConstructor(middlewareSpec);
    }

    addEndpoint(handler: Endpoint<M, Req, Res>) {
        this.endpoints.push(handler);
    }

    addSpy(handler: Spy<M, Req>) {
        this.spies.push(handler);
    }

    private async callEndpoint(req: Req, res: Res, middleware: M) {
        let userEndpoint: Endpoint<M, Req, Res> | undefined;

        for (const endpoint of this.endpoints) {
            try {
                var isWhen = endpoint.when(req, middleware);
            } catch (err) {
                this.handleThrow(endpoint, err);
                return;
            }

            if (isWhen instanceof Promise) {
                // this.catcher will never reference members of this
                // if the user wants to use a function with a binded `this`
                // they should wrap it in a lambda as is normal
                this.handleReject(endpoint, isWhen);

                try {
                    if (await isWhen) {
                        userEndpoint = endpoint;
                    }
                } catch (err) {
                    this.handleThrow(endpoint, err);
                    return;
                }
            } else if (isWhen) {
                userEndpoint = endpoint;
                break;
            }
        }

        const endpoint = userEndpoint ?? this.fallbackEndpoint;

        if (!endpoint || !endpoint.do) {
            return;
        }

        try {
            var result = endpoint.do(req, res, middleware);
        } catch (err) {
            this.handleThrow(endpoint, err);
            return;
        }

        if (result instanceof Promise && endpoint.catch) {
            this.handleReject(endpoint, result);
        }
    }

    private async callSpies(req: Req, middleware: M) {
        for (const spy of this.spies) {
            try {
                var when = spy.when(req, middleware);
            } catch (err) {
                this.handleThrow(spy, err);
                continue;
            }

            if (when instanceof Promise) {
                if (await when) {
                    spy.do(req, middleware);
                }
            } else {
                try {
                    spy.do(req, middleware);
                } catch (err) {
                    this.handleThrow(spy, err);
                    continue;
                }
            }
        }
    }

    handle(req: Req, res: Res): void {
        const middlewareInventory = new this.MiddlewareInventory(req);

        this.callSpies(req, middlewareInventory);
        this.callEndpoint(req, res, middlewareInventory);
    }

    private handleReject(maybeCatcher: CatchHandler, promise: Promise<unknown>) {
        if (maybeCatcher.catch) {
            promise.catch(maybeCatcher.catch);
        } else if (this.catcher) {
            promise.catch(this.catcher);
        }
    }

    private handleThrow(maybeCatcher: CatchHandler, err: any) {
        if (maybeCatcher.catch) {
            maybeCatcher.catch(err);
        } else if (this.catcher) {
            this.catcher(err);
        }
    }

    private middlewareSpecToConstructor(middlewareSpec: Spec): MiddlewareConstructor<M, Req> {
        const middlewareInventoryProto = {} as any;

        for (const name in middlewareSpec) {
            middlewareInventoryProto[name] = function () {
                const result = middlewareSpec[name].call(this, this[Quelaag.__req]);

                // overwrite this function for any future uses
                this[name] = () => result;
                return result;
            }
        }

        function constructor(this: any, req: Req) {
            this[Quelaag.__req] = req;
        };

        constructor.prototype = middlewareInventoryProto;

        return constructor as any;
    }

    setFallbackEndpoint(handler: FallbackEndpoint<M, Req, Res> | RequestHandler<M, Req, Res> | undefined) {
        if (typeof handler === "function") {
            this.fallbackEndpoint = {
                do: handler,
            };
        } else {
            this.fallbackEndpoint = handler;
        }
    }
}
