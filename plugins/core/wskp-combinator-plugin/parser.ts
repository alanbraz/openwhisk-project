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
import { Lexer, Parser, Token, createToken } from "chevrotain";
import * as wskd from 'openwhisk-deploy';

// --- Plugin export

export function actionContributor(config: wskd.IConfig, deployment, pkgName: string, actionName: string, action) {
    // 1. Tokenize the input.
    const lexResult = DeployLexer.tokenize(action.combinator);
    if (lexResult.errors.length > 0)
        throw lexResult.errors;

    // 2. Parse the Tokens vector.

    const parser = new DeployParser(lexResult.tokens, pkgName, initFromBaseAction(action));
    const newaction = parser.combinators()
    if (parser.errors.length > 0)
        throw parser.errors;

    newaction.actionName = actionName
    return [{
        kind: "action",
        pkgName,
        name: actionName,
        body: newaction
    }];
}


// ----------------- lexer -----------------
 
const ActionLiteral = createToken({ name: 'ActionLiteral', pattern: /[\w@.-]+/ })
const IfToken = createToken({ name: 'IfToken', pattern: /if/ })
const ThenToken = createToken({ name: 'ThenToken', pattern: /then/ })
const TryToken = createToken({ name: 'TryToken', pattern: /try/, longer_alt: ActionLiteral })
const CatchToken = createToken({ name: 'CatchToken', pattern: /catch/ })
const RetryToken = createToken({ name: 'RetryToken', pattern: /retry/ })
const ForwardToken = createToken({ name: 'ForwardToken', pattern: /forward/ })
const AfterToken = createToken({ name: 'AfterToken', pattern: /after/ })
const WithToken = createToken({ name: 'WithToken', pattern: /with/ })
const TimesToken = createToken({ name: 'TimesToken', pattern: /times/ })
const LSquare = createToken({ name: 'LSquare', pattern: /\[/ })
const RSquare = createToken({ name: 'RSquare', pattern: /]/ })
const Comma = createToken({ name: 'Comma', pattern: /,/ })
const IntegerLiteral = createToken({ name: 'IntegerLiteral', pattern: /\d+/ })

const QuotedActionLiteral = createToken({
    name: 'QuotedActionLiteral',
    pattern: /'[\w@.-][\w@ .-]*[\w@.-]'+/
})

const StringLiteral = createToken({
    name: 'StringLiteral',
    pattern: /"(?:[^\\"]|\\(?:[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/
})

const WhiteSpace = createToken({
    name: 'WhiteSpace',
    pattern: /\s+/,
    group: Lexer.SKIPPED,
    line_breaks: true
})

const allTokens = [
    WhiteSpace,
    IfToken,
    ThenToken,
    TryToken,
    CatchToken,
    RetryToken,
    ForwardToken,
    AfterToken,
    WithToken,
    TimesToken,
    LSquare,
    RSquare,
    Comma,

    IntegerLiteral,
    ActionLiteral,
    QuotedActionLiteral,
    StringLiteral
]
const DeployLexer = new Lexer(allTokens)

// ----------------- parser -----------------

const TrimQuotes = str => {
    return str.substr(1, str.length - 2)
}

class DeployParser extends Parser {

    constructor(input: Token[], readonly pkgName, private action) {
        super(input, allTokens)
        Parser.performSelfAnalysis(this)
    }
 

    public combinators = this.RULE('combinators', () => {
        return this.OR([
            {
                ALT: () => {
                    return this.SUBRULE(this.eca)
                }
            },
            {
                ALT: () => {
                    return this.SUBRULE(this.forwarder)
                }
            },
            {
                ALT: () => {
                    return this.SUBRULE(this.retry)
                }
            },
            {
                ALT: () => {
                    return this.SUBRULE(this.trycatch)
                }
            }
        ])
    })

    private eca = this.RULE('eca', () => {
        this.CONSUME(IfToken)
        const $conditionName = wskd.names.resolveQName(this.CONSUME1(ActionLiteral).image, '_', this.pkgName)
        this.CONSUME(ThenToken)
        const $actionName = wskd.names.resolveQName(this.CONSUME2(ActionLiteral).image, '_', this.pkgName)

        this.action.copy = '/whisk.system/combinators/eca'
        this.action.inputs = mergeObjects({
            $conditionName,
            $actionName
        }, this.action.inputs)

        return this.action
    })

    private trycatch = this.RULE('trycatch', () => {
        this.CONSUME(TryToken)
        const $tryName = wskd.names.resolveQName(this.CONSUME1(ActionLiteral).image, '_', this.pkgName)
        this.CONSUME(CatchToken)
        const $catchName = wskd.names.resolveQName(this.CONSUME2(ActionLiteral).image, '_', this.pkgName)

        this.action.copy = '/whisk.system/combinators/trycatch'
        this.action.inputs = mergeObjects({
            $tryName,
            $catchName
        }, this.action.inputs)

        return this.action
    })

    private forwarder = this.RULE('forwarder', () => {
        this.CONSUME(ForwardToken)
        const $forward = this.SUBRULE(this.arrayofstrings)
        this.CONSUME(AfterToken)
        const $actionName = wskd.names.resolveQName(this.CONSUME(ActionLiteral).image, '_', this.pkgName)
        this.CONSUME(WithToken)
        const $actionArgs = this.SUBRULE2(this.arrayofstrings)

        this.action.copy = '/whisk.system/combinators/forwarder'
        this.action.inputs = mergeObjects({
            $forward,
            $actionName,
            $actionArgs
        },
        this.action.inputs)
        return this.action

    })

    private retry = this.RULE('retry', () => {
        this.CONSUME(RetryToken)
        const $actionName = wskd.names.resolveQName(this.CONSUME(ActionLiteral).image, '_', this.pkgName)
        const $attempts = parseInt(this.CONSUME(IntegerLiteral).image)
        this.OPTION(() => {
            this.CONSUME(TimesToken)
        })

        this.action.copy = '/whisk.system/combinators/retry'
        this.action.inputs = mergeObjects({
            $actionName,
            $attempts
        },
        this.action.inputs)
        return this.action
    })

    private arrayofstrings = this.RULE('arrayofstrings', () => {
        const strings = []
        this.CONSUME(LSquare)
        this.OPTION(() => {
            strings.push(TrimQuotes(this.CONSUME1(StringLiteral).image))

            this.MANY(() => {
                this.CONSUME2(Comma)
                strings.push(TrimQuotes(this.CONSUME3(StringLiteral).image))
            })
        })
        this.CONSUME4(RSquare)
        return strings
    })

}

// --- utils

// Assign the source properties to target. Throw an exception when a conflict occurs.
const mergeObjects = (target, source) => {
    if (source) {
        for (const key of Object.keys(source)) {
            if (target.hasOwnProperty(key))
                throw new Error(`Duplicate key ${key}`)
            target[key] = source[key]
        }
    }
    return target
}


// Initialize action with the `baseAction` properties
const initFromBaseAction = baseAction => {
    const action: any = {}
    if (baseAction.limits)
        action.limits = baseAction.limits
    if (baseAction.annotations)
        action.annotations = baseAction.annotations
    if (baseAction.inputs)
        action.inputs = baseAction.inputs

    return action
}
