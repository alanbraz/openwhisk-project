/*
 * Copyright 2017 IBM Corporation
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { IConfig, env } from 'openwhisk-deploy';
import * as fs from 'fs-extra';
import * as expandHomeDir from 'expand-home-dir';
import * as path from 'path';

export async function resolveVariableCreator(config: IConfig) {
    const wskprops = await env.readWskProps(config);
    return (name: string) => {
        const lc = name.toLowerCase();
        let value = wskprops ? wskprops[lc] : undefined;
        if (!value) {
            const uc = name.toUpperCase();
            value = wskprops[uc];
        }
        return value;
    }
}
