'use strict';

const
  sinon = require('sinon'),
  should = require('should'),
  { Request,
    errors: {
      BadRequestError,
      PreconditionError
    }
  } = require('kuzzle-common-objects'),
  Role = require('../../../../lib/core/models/security/role'),
  KuzzleMock = require('../../../mocks/kuzzle.mock'),
  { BaseController } = require('../../../../lib/api/controllers/base'),
  RoleRepository = require('../../../../lib/core/models/repositories/roleRepository');

describe('Test: repositories/roleRepository', () => {
  let
    kuzzle,
    roleRepository;

  beforeEach(() => {
    kuzzle = new KuzzleMock();
    roleRepository = new RoleRepository(kuzzle);

    return roleRepository.init();
  });

  describe('#loadRoles', () => {
    it('should return in memory roles', () => {
      const role = {foo: 'bar'};

      roleRepository.roles.set('foo', role);
      roleRepository.loadMultiFromDatabase = sinon.stub();

      return roleRepository.loadRoles(['foo'])
        .then(result => {
          should(result).be.eql([role]);
          should(roleRepository.loadMultiFromDatabase)
            .have.callCount(0);
        });
    });

    it('should load roles from memory & database', () => {
      const
        role1 = new Role(),
        role2 = new Role(),
        role3 = new Role(),
        role4 = new Role();

      role1._id = 'role1';
      role2._id = 'role2';
      role3._id = 'role3';
      role4._id = 'role4';

      roleRepository.roles.set('role3', role3);

      roleRepository.loadOneFromDatabase = sinon.stub();
      roleRepository.loadOneFromDatabase.withArgs('role1').resolves(role1);
      roleRepository.loadOneFromDatabase.withArgs('role2').resolves(role2);
      roleRepository.loadOneFromDatabase.withArgs('role4').resolves(role4);

      return roleRepository.loadRoles(['role1', 'role2', 'role3', 'role4'])
        .then(result => {
          should(result)
            .be.an.Array()
            .match([role1, role2, role3, role4])
            .have.length(4);
          should(roleRepository.loadOneFromDatabase).calledWith('role1');
          should(roleRepository.loadOneFromDatabase).calledWith('role2');
          should(roleRepository.loadOneFromDatabase).neverCalledWith('role3');
          should(roleRepository.loadOneFromDatabase).calledWith('role4');
        });
    });

  });

  describe('#loadRole', () => {
    it('should return a bad request error when no _id is provided', () => {
      return should(roleRepository.load({})).rejectedWith(BadRequestError);
    });

    it('should load the role directly from memory if it\'s in memory', () => {
      const role = {foo: 'bar'};

      roleRepository.roles.set('foo', role);

      return roleRepository.load('foo')
        .then(result => {
          should(result)
            .be.exactly(role);
        });
    });

    it('should load the role directly from DB if it\'s not in memory', () => {
      const role = {_id: 'foobar'};

      roleRepository.loadOneFromDatabase = sinon.stub().resolves(role);

      return roleRepository.load('foo')
        .then(result => {
          should(result).be.exactly(role);
          should(roleRepository.roles).have.key('foobar', role);
        });
    });
  });

  describe('#searchRole', () => {
    it('should filter the role list with the given controllers', () => {
      const roles = {
        default: {
          _id: 'default',
          controllers: {
            '*': {
              actions: {
                '*': true
              }
            }
          }
        },
        foo: {
          _id: 'foo',
          controllers: {
            foo: {
              actions: {
                '*': true
              }
            }
          }
        },
        bar: {
          _id: 'bar',
          controllers: {
            bar: {
              actions: {
                '*': true
              }
            }
          }
        },
        foobar: {
          _id: 'foobar',
          controllers: {
            foo: {
              actions: {
                '*': true
              }
            },
            bar: {
              actions: {
                '*': true
              }
            }
          }
        }
      };

      roleRepository.search = sinon.stub().resolves({
        total: 4,
        hits: [
          roles.default,
          roles.foo,
          roles.bar,
          roles.foobar
        ]
      });

      return roleRepository.searchRole(['foo'])
        .then(result => {
          should(result.total).be.exactly(3);
          should(result.hits.length).be.exactly(3);
          should(result.hits).match([roles.default, roles.foo, roles.foobar]);
          return roleRepository.searchRole(['bar']);
        })
        .then(result => {
          should(result.total).be.exactly(3);
          should(result.hits.length).be.exactly(3);
          should(result.hits).match([roles.default, roles.bar, roles.foobar]);
          return roleRepository.searchRole(['foo', 'bar']);
        })
        .then(result => {
          should(result.total).be.exactly(4);
          should(result.hits.length).be.exactly(4);
          should(result.hits).match([roles.default, roles.foo, roles.bar, roles.foobar]);
          return roleRepository.searchRole(['baz']);
        })
        .then(result => {
          should(result.total).be.exactly(1);
          should(result.hits.length).be.exactly(1);
          should(result.hits).match([roles.default]);
          return roleRepository.searchRole(['foo'], 1);
        })
        .then(result => {
          should(result.total).be.exactly(3);
          should(result.hits.length).be.exactly(2);
          should(result.hits).match([roles.foo, roles.foobar]);
          should(result.hits).not.match([roles.default]);
          return roleRepository.searchRole(['foo'], 0, 2);
        })
        .then(result => {
          should(result.total).be.exactly(3);
          should(result.hits.length).be.exactly(2);
          should(result.hits).match([roles.default, roles.foo]);
          should(result.hits).not.match([roles.foobar]);
          return roleRepository.searchRole(['foo', 'bar'], 1, 2);
        })
        .then(result => {
          should(result.total).be.exactly(4);
          should(result.hits.length).be.exactly(2);
          should(result.hits).match([roles.foo, roles.bar]);
          should(result.hits).not.match([roles.default]);
          should(result.hits).not.match([roles.foobar]);
        });
    });
  });

  describe('#delete', () => {
    it('should reject and not trigger any event if trying to delete a reserved role', done => {
      let role = new Role();
      role._id = 'admin';

      roleRepository.delete(role)
        .then(() => {
          done(new Error('The promise is not rejected'));
        })
        .catch(e => {
          should(e).be.an.instanceOf(BadRequestError);
          should(e.id).eql('security.role.cannot_delete');
          should(kuzzle.emit).not.be.called();
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('should reject and not trigger any event if a profile uses the role about to be deleted', done => {
      kuzzle.repositories.profile.searchProfiles.resolves({
        total: 1,
        hits: [
          'test'
        ]
      });

      roleRepository.delete({_id: 'test'})
        .then(() => {
          done(new Error('The promise is not rejected'));
        })
        .catch(e => {
          should(e).be.an.instanceOf(PreconditionError);
          should(e.id).eql('security.role.in_use');
          should(kuzzle.emit).not.be.called();
          done();
        })
        .catch(e => {
          done(e);
        });
    });

    it('should call deleteFromDatabase, remove the role from memory and trigger a "core:roleRepository:delete" event', () => {
      const role = new Role();
      role._id = 'foo';

      kuzzle.repositories.profile.searchProfiles.resolves({total: 0});
      roleRepository.deleteFromDatabase = sinon.stub().resolves(null);
      roleRepository.roles.set('foo', true);

      return roleRepository.delete(role)
        .then(() => {
          should(roleRepository.deleteFromDatabase)
            .be.calledOnce()
            .be.calledWith('foo');
          should(roleRepository.roles).not.have.key('foo');
          should(kuzzle.emit)
            .be.calledOnce()
            .be.calledWith('core:roleRepository:delete', {_id: 'foo'});
        });
    });
  });

  describe('#serializeToDatabase', () => {
    it('should return a plain flat object', () => {
      let
        result,
        controllers = {
          controller: {
            actions: {
              action: true
            }
          }
        },
        role = new Role();

      role._id = 'test';
      role.controllers = controllers;

      result = roleRepository.serializeToDatabase(role);


      should(result).not.be.an.instanceOf(Role);
      should(result).be.an.Object();
      should(result.controllers).be.an.Object();
      should(result.controllers).match(controllers);
      should(result).not.have.property('_id');
      should(result).not.have.property('restrictedTo');
    });
  });

  describe('#getRoleFromRequest', () => {
    it('should build a valid role object', () => {
      const
        controllers = {
          controller: {
            actions: {
              action: true
            }
          }
        },
        request = new Request({
          collection: 'collection',
          controller: 'controller',
          action: 'action',
          _id: 'roleId',
          body: {
            controllers: controllers
          }
        });

      return roleRepository.getRoleFromRequest(request)
        .then(role => {
          should(role._id).be.exactly('roleId');
          should(role.controllers).be.eql(controllers);
        });

    });
  });

  describe('#validateAndSaveRole', () => {
    it('should reject if we update the anonymous with a role it cannot log with - case 1', () => {
      const
        bad1 = {
          controller: {
            actions: {
              action: true
            }
          }
        },
        role = new Role();

      role._id = 'anonymous';
      role.controllers = bad1;

      return should(roleRepository.validateAndSaveRole(role))
        .be.rejectedWith(BadRequestError);
    });

    it('should reject if we update the anonymous with a role it cannot log with - case 2', () => {
      const
        bad = {
          '*': {
            actions: {
              '*': false
            }
          }
        },
        role = new Role();

      role._id = 'anonymous';
      role.controllers = bad;

      return should(roleRepository.validateAndSaveRole(role))
        .be.rejectedWith(BadRequestError);
    });

    it('should reject if we update the anonymous with a role it cannot log with - case 3', () => {
      const
        bad = {
          auth: {
            actions: {
              login: false
            }
          }
        },
        role = new Role();

      role._id = 'anonymous';
      role.controllers = bad;

      return should(roleRepository.validateAndSaveRole(role))
        .be.rejectedWith(BadRequestError);
    });

    it('should allow updating the anonymous as long as it can log in', () => {
      const
        rights = {
          '*': {
            actions: {
              login: true
            }
          }
        },
        role = new Role();

      role._id = 'anonymous';
      role.controllers = rights;
      roleRepository.loadOneFromDatabase = sinon.stub().resolves(role);
      return roleRepository.validateAndSaveRole(role)
        .then(response => {
          should(response._id).be.eql('anonymous');
        });
    });

    it('should persist the role to the database and trigger a "core:roleRepository:save" event when ok', () => {
      const
        controllers = {
          controller: {
            actions: {
              action: true
            }
          }
        },
        role = new Role();

      role._id = 'test';
      role.controllers = controllers;
      roleRepository.checkNativeRoleControllersAndActions = sinon.stub().resolves();
      roleRepository.indexStorage._storageEngine.get.resolves({});

      roleRepository.persistToDatabase = sinon.stub().resolves();
      roleRepository.loadOneFromDatabase = sinon.stub().resolves(role);
      return roleRepository.validateAndSaveRole(role)
        .then(() => {
          should(roleRepository.persistToDatabase)
            .be.calledOnce()
            .be.calledWith(role);
          should(kuzzle.emit)
            .be.calledOnce()
            .be.calledWith(
              'core:roleRepository:save',
              { _id: 'test', controllers: controllers });
        });
    });
  });
  describe('#checkNativeRoleControllersAndActions', () => {
    const Funnel = require('../../../../lib/api/funnel');   
    
    it('should reject if a role contains invalid controller.', done => {
      const
        controllers = {
          iDontExist: {
            actions: {
              create: true
            }
          }
        },
        role = new Role();
      kuzzle.funnel = new Funnel(kuzzle);
      kuzzle.funnel.init();
      role._id = 'test';
      role.controllers = controllers;
      try {
        roleRepository.checkNativeRoleControllersAndActions(role);
      } catch (e) {
        done();
      } 
    });
    
    it('should reject if a role contains invalid action.', done => {
      const controllers = {
          '*': {
            actions: {
              iDontExist: true
            }
          }
        },
        role = new Role();
      kuzzle.funnel = new Funnel(kuzzle);
      kuzzle.funnel.init();
      role._id = 'test';
      role.controllers = controllers;
      try {
        roleRepository.checkNativeRoleControllersAndActions(role);
      } catch (e) {
        done();
      }
    });
    
    it('should not throw when a role contains valid controller and action.', () => {
      const
        controllers = {
          document: {
            actions: {
              create: true
            }
          }
        },
        role = new Role();
      kuzzle.funnel = new Funnel(kuzzle);
      kuzzle.funnel.init();

      role._id = 'test';
      role.controllers = controllers;
      return should(roleRepository.checkNativeRoleControllersAndActions(role))
        .not.throw();
    });
  });
  
  describe('#checkPluginsRoleControllersAndActions', () => {
    it('should warn if a plugin does not exist.', () => {
      kuzzle.pluginsManager.plugins.plugin_test = {
        object: {
          routes: [{
            verb: 'bar', action: 'publicMethod', controller: 'foobar', url: '/foobar'
          }],
          controllers: {
            foobar: { publicMethod: 'function' }
          }
        }
      };
      const
        controllers = {
          'invalid_plugin/foobar': {
            actions: {
              publicMethod: true
            }
          }
        },
        role = new Role();
      role._id = 'test';
      role.controllers = controllers;
      roleRepository.checkPluginsRoleControllersAndActions(role);
      should(kuzzle.log.warn).be.calledWith('[!WARNING!] Trying to set role "test" with plugin "invalid_plugin" which doesn\'t exist or is not enabled.');
    });
    
    it('should warn if a role contains invalid controller.', () => {
      kuzzle.pluginsManager.plugins.plugin_test = {
        object: {
          routes: [{
            verb: 'bar', action: 'publicMethod', controller: 'foobar', url: '/foobar'
          }],
          controllers: {
            foobar: { publicMethod: 'function' }
          }
        }
      };
      const
        controllers = {
          'plugin_test/invalid_controller': {
            actions: {
              publicMethod: true
            }
          }
        },
        role = new Role();
      role._id = 'test';
      role.controllers = controllers;
      roleRepository.checkPluginsRoleControllersAndActions(role);
      should(kuzzle.log.warn).be.calledWith('[!WARNING!] Trying to set role "test" with a non-existing controller "invalid_controller" in the plugin "plugin_test".');
    });
    
    it('should warn if a role contains invalid action.', () => {
      kuzzle.pluginsManager.plugins.plugin_test = {
        object: {
          routes: [{
            verb: 'bar', action: 'publicMethod', controller: 'foobar', url: '/foobar'
          }],
          controllers: {
            foobar: { publicMethod: 'function' }
          }
        }
      };
      const controllers = {
          'plugin_test/foobar': {
            actions: {
              iDontExist: true
            }
          }
        },
        role = new Role();
      role._id = 'test';
      role.controllers = controllers; 
      roleRepository.checkPluginsRoleControllersAndActions(role);
      should(kuzzle.log.warn).be.calledWith('[!WARNING!] Trying to set role "test" with a non-existing action "iDontExist" for the controller "foobar" in the plugin "plugin_test".');
    });
    
    it('should not warn when a role contains valid controller and action.', () => {
      kuzzle.pluginsManager.plugins.plugin_test = {
        object: {
          routes: [{
            verb: 'bar', action: 'publicMethod', controller: 'foobar', url: '/foobar'
          }],
          controllers: {
            foobar: {publicMethod: 'function'}
          }
        }
      };
      const
        controllers = {
          'plugin_test/foobar': {
            actions: {
              publicMethod: true
            }
          }
        },
        role = new Role();
      role._id = 'test';
      role.controllers = controllers;
      roleRepository.checkPluginsRoleControllersAndActions(role);
      should(kuzzle.log.warn).be.not.called();
    });
  });
});
