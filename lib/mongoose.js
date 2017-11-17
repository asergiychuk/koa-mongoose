const glob = require('glob');
const util = require('util');
const mongoose = require('mongoose');

mongoose.Promise = global.Promise;

const middleware = module.exports = options => {
    //mode: model
    let db = mongoose.connection;
    middleware.models = {};
    middleware.dbs = {};

    if (options.schemas) {
        //mode: schema
        db = mongoose.createConnection();
        const schemas = options.schemas + (options.schemas.lastIndexOf('/') === (options.schemas.length - 1) ? '' : '/');
        const files = glob.sync(schemas + '/**/*.js');
        files.map(file => {
            const model = file
                .replace(schemas, '')
                .replace(/\.js$/g, '')
                .replace(/\//g, '.')
                .toLowerCase();
            const schema = require(file);
            middleware.models[model] = db.model(model, schema);
        })
    }

    middleware.open(db, options);

    return  async (ctx, next) => {
        const database = typeof options.database === 'function' ? options.database(ctx) : options.database;

        if (!middleware.dbs.hasOwnProperty(database)) {
            middleware.dbs[database] = db.useDb(database);
        }

        ctx.model = model => {
            try {
                return middleware.model(database, model);
            } catch(err) {
                ctx.throw(400, err.message);
            }
        };

        ctx.document = (model, document) => new (ctx.model(model))(document);
        await next();
    }
}

middleware.model = (database, model) => {
    const name = model.toLowerCase();

    if (!middleware.models.hasOwnProperty(name)) {
        throw new Error(util.format('Model not found: %s.%s', database, model));
    }

    return middleware.dbs[database].model(model, middleware.models[name].schema);
}

middleware.document = (database, model, document) => new (middleware.model(database, model))(document);

middleware.mongoose = mongoose;

middleware.open = (db, options) => {
    if (!options || !options.host || !options.port) {
        throw new Error('options not found');
    }

    var database = typeof options.database === 'function' ? undefined : options.database

    var uri = `mongodb://${options.user ? options.user + ':' + options.pass + '@':''}${options.host}:${options.port}${database ?'/' + database : ''}`;

    db.on('error', err => {
        db.close();
    });

    if(options.events){
        for (var evt in options.events){
            db.on(evt, options.events[evt])
        }
    }

    db.openUri(uri, options.mongodbOptions);

    return db
}