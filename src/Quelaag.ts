import { Endpoint, Spy, Middleware, MiddlewareSpec, MiddlewareConstructor, FallbackEndpoint, RequestHandler } from "./types";
import { IncomingMessage, ServerResponse } from "http";

export class Quelaag<
    Req = IncomingMessage,
    Res = ServerResponse,
    Spec extends MiddlewareSpec<any, Req> = any,
    M extends Middleware<any, Spec> = any
> {
    private endpoints: Endpoint<M, Req, Res>[];
    private MiddlewareInventory: MiddlewareConstructor<M, Req>;
    private spies: Spy<M, Req>[];
    private fallbackEndpoint: FallbackEndpoint<M, Req, Res> | undefined;

    constructor(middlewareSpec: Spec) {
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

    private async callEndpoints(req: Req, res: Res, middleware: M) {
        let userEndpoint: Endpoint<M, Req, Res> | undefined;

        for (const endpoint of this.endpoints) {
            try {
                var when = endpoint.when(req);
            } catch (err) {
                if (endpoint.catch) {
                    endpoint.catch(err);
                }
                return;
            }

            if (when instanceof Promise) {
                if (endpoint.catch) {
                    when.catch(endpoint.catch);
                }
                if (await when) {
                    userEndpoint = endpoint;
                }
            } else if (when) {
                userEndpoint = endpoint;
            }
        }

        const endpoint = userEndpoint ?? this.fallbackEndpoint;

        if (!endpoint) {
            return;
        }

        if (endpoint.do !== undefined) {
            try {
                var result = endpoint.do(req, res, middleware);
            } catch (err) {
                if (endpoint.catch) {
                    endpoint.catch(err);
                }
                return;
            }

            if (result instanceof Promise && endpoint.catch) {
                result.catch(endpoint.catch);
            }
        }
    }

    private callSpies(req: Req, middleware: M) {
        for (const spy of this.spies) {
            try {
                var when = spy.when(req);
            } catch (err) {
                if (spy.catch) {
                    spy.catch(err);
                }
                continue;
            }

            if (when instanceof Promise) {
                const conditionProm = when.then(() => {
                    spy.do(req, middleware);
                });
                if (spy.catch) {
                    conditionProm.catch(spy.catch);
                }
            } else {
                try {
                    spy.do(req, middleware);
                } catch (err) {
                    if (spy.catch) {
                        spy.catch(err);
                    }
                }
            }
        }
    }

    handle(req: Req, res: Res): void {
        const middlewareInventory = new this.MiddlewareInventory(req);

        this.callSpies(req, middlewareInventory);
        this.callEndpoints(req, res, middlewareInventory);
    }

    private middlewareSpecToConstructor(middlewareSpec: Spec): MiddlewareConstructor<M, Req> {
        const middlewareInventoryProto = {} as any;

        for (const name in middlewareSpec) {
            middlewareInventoryProto[name] = function () {
                const result = middlewareSpec[name](this.__req);
                // overwrite this function for any future uses
                this[name] = () => result;
                return result;
            }
        }

        function constructor(this: any, req: Req) {
            this.__req = req;
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
