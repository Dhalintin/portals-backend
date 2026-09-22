"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = validate;
function validate(schemas) {
    return (req, _res, next) => {
        try {
            if (schemas.body) {
                req.body = schemas.body.parse(req.body);
            }
            if (schemas.query) {
                // Attach validated data to a custom property
                req.validatedQuery = schemas.query.parse(req.query);
            }
            // if (schemas.query) {
            //   req.query = schemas.query.parse(req.query) as typeof req.query;
            // }
            if (schemas.params) {
                req.params = schemas.params.parse(req.params);
            }
            next();
        }
        catch (err) {
            next(err);
        }
    };
}
