var pl = require("tau-prolog");
var session = pl.create();
var handlebars = require("handlebars");

function subToDict(substitution) {
    var output = {};
    var vars = substitution.domain();
    var strings = substitution.domain(true);
    for (var i = 0; i < vars.length; i++) {
        var value = substitution.lookup(vars[i]);
        if (value.id) {
            value = value.id;
        }
        output[strings[i]] = value;
    }
    return output;
}

handlebars.registerHelper('q', function(query, limit, options) {
    session.query(query);
    var output = "";
    for (var i = 0; i < limit; i++) {
        var done = false;
        var next = session.answer((answer) => {
            if (answer === null) {
                return "Query exceeded limit: " + query;
            } else if (answer !== false) {
                output += options.fn(subToDict(answer));
            } else {
                done = true;
            }
        });
        if (done) {
            break;
        }
    }
    return output;
})

module.exports = {
    session: session
}
