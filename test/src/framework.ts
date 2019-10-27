import * as http from "http";
import * as util from "util";

import { MiddlewareSpecification, MiddlewareInventory } from "../../src/types";
import { Cobweb } from "../../src";
import { TEST_PORT } from "./config";

export interface Test {
    readonly name: string;
    readonly run: (examiner: Examiner) => void;
    readonly cases?: number;
}

export interface Examiner {
    readonly fail: (reason?: any) => void;
    readonly pass: () => void;
    readonly test: (result: boolean, message?: string) => void;
}

export async function makeRequest<M extends MiddlewareSpecification, I extends MiddlewareInventory<M>>
    (handler: Cobweb<M, I>, path?: string): Promise<void>
{
    const server = http.createServer((req, res) => {
        handler.handle(req, res);
        res.end();
    });

    await util.promisify(cb => server.listen(TEST_PORT, cb))();

    const reqToServer = http.request({
        path,
        port: TEST_PORT,
    });

    return new Promise<void>((resolve, reject) => {
        reqToServer.once("error", (err) => {
            reject(err);
        });

        reqToServer.on("timeout", () => {
            // adding this handler prevents a timeout error from being thrown
            // we are not testing that the requests get closed, only that they are handled
        });

        reqToServer.end(() => {
            resolve();
        });

    }).finally(() => {
        // ensure that only one server is alive at a time beacuse they always use the same port
        server.close();
    });
}

export async function rejectAfter(afterMilliseconds: number): Promise<void> {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            reject(`Test timed out after ${afterMilliseconds / 1000} seconds.`);
        }, afterMilliseconds);
    });
}

export function run(testcase: Test): Promise<void> {
    return new Promise((resolve, reject) => {
        const passesRequired = testcase.cases ? testcase.cases : Infinity;
        let passes = 0;

        const maybeFinish = () => {
            if (passes >= passesRequired) {
                resolve();
            }
        }

        testcase.run({
            fail(val) {
                console.trace();
                reject(val);
            },

            pass: () => {
                resolve();
            },

            test(result, message) {
                if (result) {
                    passes += 1;
                    maybeFinish();
                    return;
                }

                return this.fail(message);
            },
        });
    });
}