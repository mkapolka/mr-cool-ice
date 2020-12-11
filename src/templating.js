var pl = require("tau-prolog");

var session = session || pl.create();
window.session = session

let varRegexp = /\((\w+)\)|('.*')|(".*")/g

// Return the name hash for a passage
function hashName(name, context) {
    context = context || {}
    let split = name.split(":-")
    let head = split[0].trim()
    let cond = split[1]
    let varMatches = head.matchAll(varRegexp);
    var vars = []
    for (let [_, a, b, c] of varMatches) {
        vars.push(context[a] || a || b || c.slice(1,c.length-1))
    }

    let hashKey = head.replace(varRegexp, "%")
    return {
        key: hashKey,
        vars: vars,
        cond: cond
    }
}

function subToDict(substitution) {
    var output = {};
    var vars = substitution.domain();
    var strings = substitution.domain(true);
    for (var i = 0; i < vars.length; i++) {
        var value = substitution.lookup(vars[i]);
        let jsValue = value.toJavaScript();
        if (typeof(jsValue) === "string") {
            jsValue = jsValue.replace(/^'|'$/g, '')
            jsValue = jsValue.replace(/\\n/g, '\n')
        }
        output[strings[i]] = jsValue

    }
    return output;
}


function command(line) {
    if (line.startsWith("\\")) {
        return line.split(" ")[0].slice(1)
    }
    return null
}

function parse(body) {
    let root = {command: "base", body: []}
    let stack = [root]
    var context = root
    let lines = body.split("\n");
    for (let line of lines) {
        let c = command(line)
        switch (c) {
            case "if":
                let newContext = {
                    command: "if",
                    query: line.split(" ").slice(1).join(" "),
                    body: [],
                }
                context.body.push(newContext)
                context = newContext
                stack.push(context)
            break;
            case "else":
                let elseContext = {
                    command: "else",
                    body: [],
                }
                context.elseBody = elseContext.body
                stack.pop() // Pop the if
                stack.push(elseContext)
                context = elseContext
            break;
            case "end":
                stack.pop()
                context = stack[stack.length - 1]
            break;
            case "each":
                let eachContext = {
                    command: "each",
                    query: line.split(" ").slice(1).join(" "),
                    body: [],
                }
                context.body.push(eachContext);
                context = eachContext;
                stack.push(context)
            break;
            case "do":
                context.body.push({
                    command: "do",
                    query: line.split(" ").slice(1).join(" ")
                })
            break;
            case "display":
                context.body.push({
                    command: "display",
                    query: line.split(" ").slice(1).join(" ")
                })
            break;
            case "display?":
                context.body.push({
                    command: "display?",
                    query: line.split(" ").slice(1).join(" ")
                })
            break;
            default:
                context.body.push({
                    command: "print",
                    text: line
                })
            break;
        }
    }
    return root.body
}

function renderLine(context, line) {
    return line.replace(/{([\w\d]+)}/g, (_, v) => {
        return context[v]
    })
}

async function queryMap(query, limit, f) {
    limit = limit || 100
    session.query(query, {
        error: err => console.error(`Error in query ${query}: ${err}`)
    });

    let output = []

    return new Promise(async (resolve, reject) => {
        let output = []
        var done = false
        while (!done) {
            await new Promise((resolve, reject) => session.answer({
                success: answer => {
                    output.push(f(subToDict(answer)))
                    resolve()
                },
                limit: () => reject("Query exceeded limit: " + query),
                error: err => reject("Error: " + err),
                fail: () => {
                    done = true
                    resolve(output.slice(0, limit))
                }
            }))
        }
        resolve(output)
    })
}

// Convert a substituation from tau into a dictionary of Varname : value pairs
function subToDict(substitution) {
    var output = {};
    var vars = substitution.domain();
    var strings = substitution.domain(true);
    for (var i = 0; i < vars.length; i++) {
        var value = substitution.lookup(vars[i]);
        let jsValue = value.toJavaScript();
        if (typeof(jsValue) === "string") {
            jsValue = jsValue.replace(/^'|'$/g, '')
            jsValue = jsValue.replace(/\\n/g, '\n')
        }
        output[strings[i]] = jsValue
    }
    return output;
}

async function queryContexts(query, limit) {
    return queryMap(query, limit, answer => answer)
}

function mergeContexts(a, b) {
    let output = {}
    for (let key in a) {
        output[key] = a[key]
    }
    for (let key in b) {
        output[key] = b[key]
    }
    return output
}

async function render(program, context) {
    let output = ""
    let stack = []
    context = context || {}
    for (let command of program) {
        switch (command.command) {
            case "print":
                output += renderLine(context, command.text) + "\n"
            break;
            case "if":
                let ifQuery = await queryContexts(command.query, 1);
                if (ifQuery.length > 0) {
                    let newContext = mergeContexts(context, ifQuery[0]);
                    output += await render(command.body, newContext)
                } else if (command.elseBody) {
                    output += await render(command.elseBody)
                }
            break;
            case "each":
                let eachQuery = await queryContexts(command.query);
                if (eachQuery.length > 0) {
                    for (let queryResult of eachQuery) {
                        let newContext = mergeContexts(context, queryResult);
                        output += await render(command.body, newContext)
                    }
                } else if (command.elseBody) {
                    output += await render(command.elseBody)
                }
            break;
            case "do":
                let ctx = Object.keys(context).map(k => `${k} = ${context[k]}`).join(", ")
                let query = `${ctx}, ${command.query}`
                console.log("Doing", query)
                console.log(await queryMap(query, undefined, a => a))
            break;
            case "display":
                let {passage, context: displayContext} = await window.story.resolvePassage(command.query, context)
                output += await renderText(passage.source, displayContext)
            break;
            case "display?":
                try {
                    let {passage, context: displayContext} = await window.story.resolvePassage(command.query, context)
                    output += await renderText(passage.source, displayContext)
                } catch (e) {
                    console.warn(e)
                }
            break;
        }
    }
    return output
}

async function renderText(body, context) {
    return render(parse(body), context)
}

module.exports = {
    render: renderText,
    session: session,
    queryMap: queryMap,
    hashName: hashName
}
