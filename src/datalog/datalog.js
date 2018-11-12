'use strict';

var $ = require("jquery");
var fengari = require("fengari-web");
var fs = require("fs");
var handlebars = require("handlebars");

var line_parser = require("./line_parser");
var datalog_lua = fs.readFileSync(__dirname + "/datalog.lua", 'utf8');

fengari.load(datalog_lua)();
var lua_datalog = get_datalog()

function get_datalog() {
    fengari.lua.lua_getglobal(fengari.L, "datalog")
    var result = fengari.interop.tojs(fengari.L, 1)
    fengari.lua.lua_pop(fengari.L, 1)
    return result;
}

function unwrap_table(t) {
    if (t === undefined) {
        return undefined;
    }
    var output = {}
    for (let pair of t) {
        var k = pair[0];
        var v = pair[1];
        if (typeof(v) === "function") {
            v = unwrap_table(v);
        }
        output[k] = v;
    }
    return output
}

function _wrap_lua_f(f) {
    return function(first, ...rest) {
        return f.apply(first, rest)
    }
}

// pred_name : string, arity : int
var make_pred = _wrap_lua_f(lua_datalog.get("make_pred"))
// id : string
var make_var = _wrap_lua_f(lua_datalog.get("make_var"))
// id : string
var make_const = _wrap_lua_f(lua_datalog.get("make_const"))
// pred_name : string, terms : term[] (var | const)
var make_literal = _wrap_lua_f(lua_datalog.get("make_literal"))
// head : literal, body : literal[]
var make_clause = _wrap_lua_f(lua_datalog.get("make_clause"))
// clause : clause
var assert = _wrap_lua_f(lua_datalog.get("assert"))
// clause : clause
var retract = _wrap_lua_f(lua_datalog.get("retract"))
// literal : literal -> [answers]
var ask = _wrap_lua_f(lua_datalog.get("ask"))

function _statement_to_literal(statement) {
    var terms = []
    for (let token of statement.tokens) {
        if (token.type === "const") {
            terms.push(make_const(token.name));
        }
        if (token.type === "variable") {
            terms.push(make_var(token.name))
        }
    }
    return make_literal(statement.words, [undefined].concat(terms));
}

function _string_to_clause(text) {
    var parsed = line_parser.parse(text);
    console.log(parsed);
    if (parsed.type === "claim") {
        var head = _statement_to_literal(parsed.statement);
        return make_clause(head, []);
    }

    if (parsed.type === "rule") {
        var head = _statement_to_literal(parsed.head);
        var body = parsed.body.map(_statement_to_literal);
        var clause = make_clause(head, [undefined].concat(body));
        return assert(clause);
    }
}

function public_assert(text) {
    var clause = _string_to_clause(text);
    assert(clause);
}

function public_retract(text) {
    var clause = _string_to_clause(text);
    retract(clause);
}

function format_answers(answers, varNames) {
    var output = []
    if (!answers) { return [] }
    for (let k of answers) {
        if (k[0] !== "name" && k[0] !== "arity") {
            var result = {};
            for (let j of k[1]) {
                var key = varNames[j[0] - 1];
                if (key) {
                    var value = j[1];
                    result[key] = value;
                }
            }
            output.push(result);
        }
    }
    return output;
}

function public_ask(text) {
    var parsed = line_parser.parse(text);
    var varNames = parsed.statement.tokens.map((t) => t.type === "variable" ? t.name : undefined);
    var literal = _statement_to_literal(parsed.statement);
    var answers = ask(literal);
    return format_answers(answers, varNames);
}

function collect_meta(text) {
    var meta = make_literal("meta", [undefined].concat([make_var("command"), make_var("pred"), make_var("v")]))
    var varNames = ["command", "pred", "v"]
    var answers = ask(meta)
    return format_answers(answers, varNames);
}

handlebars.registerHelper("q", function(query, options) {
    var output = "";
    // Format provided variables
    for (var key in options.hash) {
        query = query.replace(`\(${key}\)`, `"${options.hash[key]}"`);
    }
    for (let answer of public_ask(query)) {
        output += options.fn(answer);
    }
    return output;
})

handlebars.registerHelper("assert", function(query, options) {
    public_assert(query);
})

handlebars.registerHelper("retract", function(query, options) {
    public_retract(query);
})


module.exports = {
    assert: public_assert,
    ask: public_ask,
    collect_meta: collect_meta
}
