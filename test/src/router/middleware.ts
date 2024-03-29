import { quelaag, router } from "../../../src";
import { makeRequest, Test } from "../framework";
import { incomingMessageNotAny, noOp, numberNotAny, objectNotAny, stringNotAny } from "../util";

export const middlewareTests: Test[] = [{
    name: "Middleware should receive the request object when called from a when handler.",
    run: async ({ test }) => {
        const handler = router(quelaag({
            takeReq: req => {
                test(!!req);
            }
        }));

        handler.addEndpoint({
            when: (req, middleware) => {
                objectNotAny(req);
                objectNotAny(middleware);
                middleware.takeReq();
                return true;
            },
            do: () => {},
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware should receive the request object when called from a do handler.",
    run: async ({ test }) => {
        const handler = router(quelaag({
            takeReq: (req) => {
                test(!!req);
            }
        }));

        handler.setFallbackEndpoint({
            do: (req, res, middleware) => {
                middleware.takeReq();
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware should receive the request object when called from middleware.",
    run: async ({ test }) => {
        const handler = router(quelaag({
            callTakeReq(req) {
                this.takeReq(req);
            },
            takeReq: (req) => {
                test(!!req);
            },
        }));

        handler.setFallbackEndpoint({
            do: (req, res, middleware) => {
                middleware.callTakeReq();
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware can be called from a request spy.",
    run: async ({ test }) => {
        const handler = router(quelaag({
            helloWorld: req => "hello world",
        }));

        handler.setFallbackEndpoint({
            do: (req, res, middleware) => {
                const str = middleware.helloWorld();
                stringNotAny(str);
                test(str === "hello world");
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware calls are memoised.",
    cases: 4,
    run: async ({ test }) => {
        let externalData = "one";

        const handler = router(quelaag({
            getExternalData(req): string {
                externalData += " change";
                return externalData;
            },
            getMiddlewareData(req): string {
                return this.getExternalData(req);
            },
            typeCheck(req): void {
                incomingMessageNotAny(req);
                stringNotAny(this.getExternalData(req));
                stringNotAny(this.getMiddlewareData(req));
                noOp();
            }
        }));

        handler.addSpy({
            when: (req, middleware) => {
                middleware.getExternalData();
                middleware.getMiddlewareData();
                const str1 = middleware.getExternalData();
                const str2 = middleware.getMiddlewareData();

                stringNotAny(str1);
                stringNotAny(str2);

                return true;
            },
            do: (req, middleware) => {
                middleware.getExternalData();
                middleware.getMiddlewareData();
                middleware.getExternalData();
                middleware.getMiddlewareData();

                const str1 = middleware.getExternalData();
                const str2 = middleware.getMiddlewareData();

                stringNotAny(str1);
                stringNotAny(str2);
            },
        });

        handler.setFallbackEndpoint({
            do: (req, res, middleware) => {
                const externalStr = middleware.getExternalData();
                stringNotAny(externalStr);
                test(externalStr === "one change", externalStr);

                const middlewareStr = middleware.getExternalData();
                stringNotAny(middlewareStr);
                test(middlewareStr === "one change", middlewareStr);

                // same again
                test(middleware.getExternalData() === "one change", middleware.getExternalData());
                test(middleware.getMiddlewareData() === "one change", middleware.getMiddlewareData());
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware calls are memoised across spies.",
    cases: 4,
    run: async ({ test }) => {
        let externalData = "one";

        const handler = router(quelaag({
            getExternalData: (req) => {
                externalData += " change"
                return externalData;
            },
        }));

        handler.addSpy({
            when: () => true,
            do: (req, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
            }
        });

        handler.addSpy({
            when: () => true,
            do: (req, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware calls are memoised across handlers.",
    cases: 8,
    run: async ({ test }) => {
        let externalData = "one";

        const handler = router(quelaag({
            getExternalData: (req) => {
                externalData += " change"
                return externalData;
            },
        }));

        handler.addSpy({
            when: (req, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
                return true;
            },
            do: (req, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
            }
        });

        handler.addEndpoint({
            when: (req, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
                return true;
            },
            do: (req, res, middleware) => {
                test(middleware.getExternalData() === "one change");
                test(middleware.getExternalData() === "one change");
            }
        });

        await makeRequest(handler);
    },
},

{
    name: "Middleware calls are not memoised across different requests.",
    cases: 3,
    run: async ({ test }) => {
        let expected = 0;
        let actual = 0;

        const handler = router(quelaag({
            increment: () => {
                actual += 1;
                return actual;
            },
        }));

        handler.addSpy({
            when: (req, middleware) => {
                middleware.increment();
                return true;
            },
            do: (req, middleware) => {
                middleware.increment();
            }
        });

        handler.addEndpoint({
            when: (req, middleware) => {
                middleware.increment();
                return true;
            },
            do: (req, res, middleware) => {
                // we expect that the actual is incremented by the middleware call
                expected += 1;
                test(middleware.increment() === expected, `Expected ${expected}, received ${actual}.`);
            }
        });

        await makeRequest(handler);
        await makeRequest(handler);
        await makeRequest(handler);
    },
},

{
    name: "Middleware can call each other.",
    cases: 2,
    run: ({ test }) => {
        const handler = router(quelaag({
            number(req): number {
                return 100;
            },
            isEven(req): boolean {
                return this.number(req) % 2 === 0;
            },
            isNotEven(req): boolean {
                return !this.isEven(req);
            },
            isOdd: function(req): boolean {
                return !this.isEven(req) && this.isNotEven(req);
            },
            typeCheck(req): void {
                incomingMessageNotAny(req);
                numberNotAny(this.number(req));
                noOp();
            }
        }));

        handler.addEndpoint({
            when: () => true,
            do: (req, res, middleware) => {
                test(middleware.isEven() === true);
                test(middleware.isOdd() === false);
            }
        });

        makeRequest(handler);
    },
},

{
    name: "Middleware can be asynchronous.",
    cases: 2,
    run: ({ test }) => {
        const handler = router(quelaag({
            async number(req): Promise<number> {
                return 100;
            },
            async isEven(req): Promise<boolean> {
                return await this.number(req) % 2 == 0;
            },
            isOdd: async function(req): Promise<boolean> {
                return !await this.isEven(req);
            }
        }));

        handler.addEndpoint({
            when: () => true,
            do: async (req, res, middleware) => {
                test(await middleware.isEven() === true);
                test(await middleware.isOdd() === false);
            }
        });

        makeRequest(handler);
    },
}];
