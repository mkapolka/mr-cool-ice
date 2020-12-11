var pl = require("tau-prolog");
var session = session || pl.create();
window.session = session
var handlebars = require("handlebars");

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

function reportError(result, action) {
    if (result instanceof pl.type.Term) {
        console.error(`Error while ${action}: ${result.toString()}`)
        return false
    }
    return true
}

function perform(query) {
    let result = session.query(query)
    reportError(result)
    session.answers(() => undefined, 100)
}

async function qmap(query, limit, f) {
    limit = limit || 100
    session.query(query, {
        error: err => console.error(`Error in query ${query}: ${err}`)
    });

    let output = []

    let p = new Promise((resolve, reject) => {
        let output = []
        session.answer({
            success: answer => {
                output.push(f(answer))
            },
            limit: () => reject("Query exceeded limit: " + query),
            error: err => reject("Error: " + err),
            fail: () => resolve(output)
        })
    })

    let result = await p

    return output.slice(0,limit);
}

handlebars.registerHelper('q', function(query, options) {
    let limit = 'limit' in options.hash ? options.hash.limit : 100
    let output = ""
    let any = false

    console.log(query, query.charAt(query.length - 1))
    if (query.trim().charAt(query.length - 1) !== ".") {
        query = query + ".";
    }

    let answers = qmap(query, limit, (answer) => {
        any = true;
        console.log("maping", answer)
        output += options.fn(subToDict(answer));
    })

    if (!any) {
        output = options.inverse();
    }
    return output;
})

handlebars.registerHelper('qjoin', function(query, term, delim, last, options) {
    let limit = options.limit || 100
    let output = ""

    let answers = qmap(query, limit, (answer) => {
        return subToDict(answer)[term]
    })

    if (answers.length == 1) {
        return answers[0]
    } else if (answers.length == 2 && last) {
        return answers[0] + last + answers[1]
    } else if (last) {
        return answers.slice(0, -1).join(delim) + last + answers[answers.length - 1]
    } else {
        return answers.join(delim)
    }
})

module.exports = {
    session: session,
    perform: perform,
}
