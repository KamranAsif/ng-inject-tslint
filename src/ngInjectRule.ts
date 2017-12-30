import * as Lint from 'tslint';
import * as ts from 'typescript';

export class Rule extends Lint.Rules.TypedRule {
  static metadata: Lint.IRuleMetadata = {
    description: 'Ensures injectable functions have @ngInject jsdoc',
    hasFix: false,
    optionExamples: [true],
    options: null,
    optionsDescription: 'Not configurable.',
    requiresTypeInfo: true,
    ruleName: 'ng-inject',
    type: 'functionality',
    typescriptOnly: true,
  };

  static FAILURE_STRING = 'Missing ngInject comment';

  static SINGLE_PARAM_FNS = [
    'config',
    'run',
  ];

  static TWO_PARAM_FNS = [
    'animation',
    'component',
    'controller',
    'decorator',
    'directive',
    'factory',
    'filter',
    'provider',
    'service',
  ];

  static INJECTABLE_FNS = [
    ...Rule.SINGLE_PARAM_FNS,
    ...Rule.TWO_PARAM_FNS,
  ];

  applyWithProgram(sourceFile: ts.SourceFile, program: ts.Program):
      Lint.RuleFailure[] {
    const typeChecker = program.getTypeChecker();
    const ngInjectWalker =
        // tslint:disable-next-line no-use-before-declare
        new NgInjectWalker(sourceFile, this.ruleName, typeChecker);
    return this.applyWithWalker(ngInjectWalker);
  }
}

class NgInjectWalker extends Lint.AbstractWalker<void> {
  constructor(
      sourceFile: ts.SourceFile, ruleName: string,
      private checker: ts.TypeChecker) {
    super(sourceFile, ruleName, undefined);
  }

  walk(sourceFile: ts.SourceFile) {
    const cb = (node: ts.Node): void => {
      if (node.kind === ts.SyntaxKind.CallExpression) {
        this.handleCallExpression(node as ts.CallExpression);
      }

      return ts.forEachChild(node, cb);
    };

    return ts.forEachChild(sourceFile, cb);
  }

  private handleCallExpression(callExpression: ts.CallExpression) {
    const callArguments = callExpression.arguments;
    const expression = callExpression.expression;

    if (!ts.isPropertyAccessExpression(expression)) {
      return;
    }

    if (!this.isNgModuleCall(expression)) {
      return;
    }

    let injectable: ts.Node =
        this.getInjectableArgument(expression, callArguments);

    if (ts.isIdentifier(injectable)) {
      const fnSymbol = this.checker.getSymbolAtLocation(injectable);

      if (!fnSymbol || !fnSymbol.declarations) {
        return;
      }

      injectable = fnSymbol.declarations[0];

      if (ts.isVariableDeclaration(injectable) && injectable.initializer) {
        injectable = injectable.initializer;
      }
    }

    if (ts.isClassLike(injectable)) {
      const constructorFn = injectable.members.find(
          classMember => ts.isConstructorDeclaration(classMember));

      if (!constructorFn) {
        return;
      }

      injectable = constructorFn;
    }

    if (this.missingNgInjectComment(
            injectable as ts.SignatureDeclarationBase)) {
      this.addFailureAtNode(injectable, Rule.FAILURE_STRING);
    }
  }

  private missingNgInjectComment(injectable: ts.SignatureDeclarationBase) {
    if (!injectable.parameters.length) {
      return false;
    }

    const jsDocTags = ts.getJSDocTags(injectable) || [];
    const hasNgInject =
        jsDocTags.some(jsDocTag => jsDocTag.getText().includes('@ngInject'));
    return !hasNgInject;
  }

  private isNgModuleCall(propertyAccessExpression:
                             ts.PropertyAccessExpression) {
    const leftHandSideExpression: ts.LeftHandSideExpression =
        propertyAccessExpression.expression;

    const name: ts.Identifier = propertyAccessExpression.name;

    const expressionType =
        this.checker.getTypeAtLocation(leftHandSideExpression);

    const expressionTypeString = this.checker.typeToString(expressionType);

    if (expressionTypeString !== 'IModule') {
      return false;
    }

    const moduleFnName: string = ts.idText(name);
    return Rule.INJECTABLE_FNS.includes(moduleFnName);
  }

  private getInjectableArgument(
      propertyAccessExpression: ts.PropertyAccessExpression,
      callArguments: ts.NodeArray<ts.Expression>) {
    const name: ts.Identifier = propertyAccessExpression.name;
    const moduleFnName = ts.idText(name);

    return Rule.TWO_PARAM_FNS.includes(moduleFnName) ? callArguments[1] :
                                                       callArguments[0];
  }
}
