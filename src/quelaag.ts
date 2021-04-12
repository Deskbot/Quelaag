import { Middleware, MiddlewareSpec, Quelaag, QuelaagReq, ValuesOf } from "./types";
import { IncomingMessage } from "http";

const __req = Symbol("request key");
const __context = Symbol("context key");

export function quelaag<
    Context = undefined,
    Req = IncomingMessage,
    Spec extends MiddlewareSpec<Context, Req> = MiddlewareSpec<Context, Req>,
>
    (middlewareSpec: Spec): Quelaag<Context, Req, Spec>
{
    const middlewareProto = {} as any;

    // Build a Middleware prototype.

    for (const name in middlewareSpec) {
        middlewareProto[name] = function() {
            const result = middlewareSpec[name].call(this, this[__req], this[__context]);

            // This function exists on the object prototype.
            // Create a new function on the instance.
            // If the same method is called again,
            // the instance function takes precedence, returning the memoised result.
            // The lifetime of the memoised values in memory is tied to the lifetime of the middleware instance.
            this[name] = () => result;

            return result;
        }
    }

    // Define the constructor for objects with the middleware prototype.

    function constructor(this: any, req: Req, context: Context) {
        this[__req] = req;
        this[__context] = context;
    };

    constructor.prototype = middlewareProto;

    return (req, context) => new (constructor as any)(req, context);
}

export default quelaag;

/**
 * This function exists only to allow you to specify the type of Context and Req,
 * while still getting TypeScript to infer Spec.
 * Currently in TypeScript, if you specify any of the type arguments to a function,
 * none of the arguments are inferred.
 * This function won't be necessary if this fact about TypeScript changes.
 */
export function quelaagPartialTypes<Context, Req = IncomingMessage>() {
    return <
        Spec extends MiddlewareSpec<Context, Req>
    >
    (spec: Spec) => {
        return quelaag<Context, Req, Spec>(spec);
    };
}

export function subquelaag<
    Req,
    Parent extends Quelaag<any, Req, any>,
    ChildSpec extends MiddlewareSpec<ChildContext, Req>,
    ChildContext = ReturnType<Parent>,
>
    (parent: Parent, childSpec: ChildSpec): Quelaag<ChildContext, Req, ChildSpec>
{
    return quelaag(childSpec);
}

export function subquelaag2<Parent extends Quelaag = never>() {
    return <
        Req = QuelaagReq<Parent>,
        ChildContext = ReturnType<Parent>,
        ChildSpec extends MiddlewareSpec<ChildContext, Req> = MiddlewareSpec<ChildContext, Req>,
    >
    (childSpec: ChildSpec): Quelaag<ChildContext, Req, ChildSpec> => {
        return quelaag(childSpec);
    }
}

export function multiParentSubquelaag<
    Parents extends Record<keyof any, Quelaag<any, Req>>,
    ChildSpec extends MiddlewareSpec<ChildContext, Req>,
    Req = QuelaagReq<ValuesOf<Parents>>,
    ChildContext = {
        [K in keyof Parents]: ReturnType<Parents[K]>
    },
>
    (parent: Parents, childSpec: ChildSpec): Quelaag<ChildContext, Req, ChildSpec>
{
    return quelaag(childSpec);
}
