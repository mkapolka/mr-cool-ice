'use strict';

var $ = require("jquery");
var fengari = require("fengari-web");
var fs = require("fs");
var Handlebars = require("handlebars");
var story = require("../story");

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
var make_list = _wrap_lua_f(lua_datalog.get("make_list"))

function _statement_to_literal(statement) {
    var terms = []
    for (let token of statement.tokens) {
        if (token.type === "const") {
            terms.push(make_const(token.name));
        }
        if (token.type === "variable") {
            if (token.name != "") {
                terms.push(make_var(token.name))
            } else {
                terms.push(make_var())
            }
        }
    }
    return make_literal(statement.words, make_list(terms), statement.negated);
}

function _string_to_clauses(text) {
    var parsed = line_parser.parse(text);
    if (parsed.type === "claim") {
        var head = _statement_to_literal(parsed.statement);
        return [make_clause(head, [])];
    }

    if (parsed.type === "rule") {
        var head = _statement_to_literal(parsed.head);
        var body = make_list(parsed.body.map(_statement_to_literal));
        return [make_clause(head, body)];
    }

    if (parsed.type === "multistatement") {
        return parsed.statements.map(_statement_to_literal).map((l) => make_clause(l, []));
    }
}

function public_assert(text) {
    var clauses = _string_to_clauses(text);
    for (let clause of clauses) {
        assert(clause);
    }
}

function public_retract(text) {
    var clauses = _string_to_clauses(text);
    for (let clause of clauses) {
        assert(clauses);
    }
}

function format_answers(answers, varNames) {
    var output = []
    if (!answers) { return [] }
    var result_set = {};
    for (let k of answers) {
        if (k[0] !== "name" && k[0] !== "arity") {
            var result = {};
            for (let j of k[1]) {
                var key = varNames[j[0] - 1];
                if (key && key != "") {
                    var value = j[1];
                    result[key] = value;
                }
            }
            var result_key = JSON.stringify(result)
            result_set[result_key] = result;
        }
    }
    return Object.values(result_set);
}

function public_ask(text) {
    var parsed = line_parser.parse(text);
    var varNames = [];
    var answers = {}
    if (parsed.type === "multistatement") {
        // rewrite to be one rule
        varNames = parsed.statements.map(
            (statement) => statement.tokens.filter(
                (t) => t.type === "variable"
            ).map((v) => v.name)
        ).reduce((p, next) => p.concat(next), []);
        varNames = _.uniq(varNames);
        var head = make_literal("public_ask", make_list(varNames.map(make_var)))
        var body = make_list(parsed.statements.map(_statement_to_literal));
        var clause = make_clause(head, body)
        assert(clause)
        answers = ask(head)
        retract(clause)
    } else {
        varNames = parsed.statement.tokens.map((t) => t.type === "variable" ? t.name : undefined);
        var literal = _statement_to_literal(parsed.statement);
        answers = ask(literal);
    }
    return format_answers(answers, varNames);
}

function collect_meta() {
    var numberedVarNames = ["0", "1", "2", "3", "4", "5", "6", "7", "8"];
    function _query_meta(n) {
        let shortNameList = numberedVarNames.slice(0, n).map(make_var);
        var meta = make_literal("meta", make_list([make_var("command"), make_var("predicate")].concat(shortNameList)));
        var varNames = ["command", "predicate"].concat(numberedVarNames);
        var answers = ask(meta);
        return format_answers(answers, varNames);
    }
    var answers = [];
    for (var i = 0; i < 9; i++) {
        answers = answers.concat(_query_meta(i));
    }
    return answers;
}

var SIDE_EFFECTS = {
    assert: function(predicate, ...args) {
        var literal = make_literal(predicate, make_list(args.map(make_const)));
        var clause = make_clause(literal, []);
        assert(clause);
    },
    retract: function(predicate, ...args) {
        var literal = make_literal(predicate, make_list(args.map(make_const)));
        var clause = make_clause(literal, []);
        retract(clause);
    }
}

// TODO: This isn't going to allow `display`, since there's no method to
// append / prepend text to the passage from here. Perform-ing might need
// to live somewhere else
function public_perform(action_text) {
    var action_clauses = _string_to_clauses(action_text);
    for (let clause of action_clauses) {
        assert(clause);
    }
    var sideEffects = collect_meta()
    for (let sideEffect of sideEffects) {
        var args = [];
        var i = 0;
        while (sideEffect[i] !== undefined) {
            args.push(sideEffect[i]);
            i++;
        }
        if (SIDE_EFFECTS[sideEffect.command] !== undefined) {
            SIDE_EFFECTS[sideEffect.command].apply(null, [sideEffect.predicate].concat(args));
        } else {
            throw `${sideEffect.command} is not a meta command.`
        }
        
    }
    for (let clause of action_clauses) {
        retract(clause);
    }
}

function _HBFormatPassage(passageName, hash, quotes=true) {
    var quote = quotes ? '"' : '';
    for (var key in hash) {
        passageName = passageName.replace(`\(${key}\)`, `${quote}${hash[key]}${quote}`);
    }
    return passageName;
}

function query_helper (query, options) {
    var output = "";
    // Format provided variables
    query = _HBFormatPassage(query, options.hash);
    let answers = public_ask(query);
    if (answers.length === 0) {
        return options.inverse(options.hash);
    }
    let limit = options.hash.limit || 10000;
    for (let answer of answers.slice(0, limit)) {
        output += options.fn(answer);
    }
    return output;
}
Handlebars.registerHelper("q", query_helper);

Handlebars.registerHelper("qif", function(query, options) {
    options.hash.limit = 1;
    return query_helper(query, options);
})

Handlebars.registerHelper("qlink", function(name, query, options) {
    name = _HBFormatPassage(name, options.hash, false)
    query = _HBFormatPassage(query, options.hash)
    var output = `[[${name}|${query}]]`
    console.log(output)
    return output
})

Handlebars.registerHelper("assert", function(query, options) {
    public_assert(_HBFormatPassage(query, options.hash));
})

Handlebars.registerHelper("perform", function(query, options) {
    public_perform(_HBFormatPassage(query, options.hash));
})

Handlebars.registerHelper("retract", function(query, options) {
    public_retract(query);
})

Handlebars.registerHelper("qjoin", function(query, which, options) {
    let joiner = options.hash.joiner || ", ";
    let last = options.hash.last;

    query = _HBFormatPassage(query, options.hash);
    var answers = public_ask(query);
    answers = answers.map((a) => a[which]);

    if (last) {
        answers = answers.slice(0,-2).concat(answers.slice(-2).join(last));
    }

    console.log(answers, answers.join(joiner))
    return answers.join(joiner);
})

// TODO: This helper should live in story.js/passage.js/the level above
// - no reason to import ../story.js from this module
Handlebars.registerHelper("display", function(query, options) {
    var passage = _HBFormatPassage(query, options.hash);
    return new Handlebars.SafeString(window.story.render(passage));
});


module.exports = {
    assert: public_assert,
    ask: public_ask,
    collect_meta: collect_meta,
    perform: public_perform
}
