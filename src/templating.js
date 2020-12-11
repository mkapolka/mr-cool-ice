var pl = require("tau-prolog");

var session = session || pl.create();
window.session = session

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

console.log(parse(`
asd
qwer
\\if hi(there)
then do this thing

\\else
Do this toher thing
\\end

More lines at the end
`))

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
                    console.log("got one")
                    output.push(f(answer))
                    resolve()
                },
                limit: () => reject("Query exceeded limit: " + query),
                error: err => reject("Error: " + err),
                fail: () => {
                    done = true
                    console.log("donezo")
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
    return queryMap(query, limit, answer => {
        return subToDict(answer)
    })
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
                let qq = await queryContexts(command.query, 1);
                if (qq.length > 0) {
                    let newContext = mergeContexts(context, qq[0]);
                    output += await render(command.body, newContext)
                } else if (command.elseBody) {
                    output += await render(command.elseBody)
                }
            break;
        }
    }
    console.log("Final output", output)
    return output
}

async function renderText(body) {
    return render(parse(body))
}

module.exports = {
    render: renderText,
    session: session
}
