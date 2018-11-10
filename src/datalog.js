'use strict';

var $ = require("jquery");
var fengari = require("fengari-web");
var fs = require("fs");

var datalog_lua = fs.readFileSync(__dirname + "/datalog.lua", 'utf8');

fengari.load(datalog_lua);

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
        return return_map(f.apply(first, rest))
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

function public_assert(text) {
    //
}

module.exports = {
    assert: public_assert
}
