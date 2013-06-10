TopologyTreeSourceCreator = function(options) {
	if (typeof options != "object") {
		throw new TypeError("Must provide renderTree and displayError callbacks in options");
	}
	if (typeof options.renderTree != "function") {
		throw new TypeError("renderTree argument must be a function");
	}
	if (typeof options.displayError != "function") {
		throw new TypeError("displayError argument must be a function");
	}

	var renderTree = options.renderTree;
	var displayError = options.displayError;

	var elementLookup = {};
	var elementsWithNoParents = [];
	var elementsWithChildren = [];

	function initializeAndBuildTree(userSettings, elements) {
		var settings = $.extend({
			topLevelParentIds : []
		}, userSettings);
		elementLookup = {};
		elementsWithNoParents = [];
		elementsWithChildren = [];
		$.each(elements, function(i, element) {
			elementLookup[element.id] = element;
			if (element.parents.length == 0) {
				elementsWithNoParents.push(element.id);
			}
			if (element.hasChildren) {
				elementsWithChildren.push(element.id);
			}
		});
		populateTopologicalParentFilter(settings.topLevelParentIds);
		buildTree(settings.topLevelParentIds);
	}

	function getElementStatuses(elements) {
		var promises = [];
		$.each(elements, function(i, element) {
			var deferred = UPTIME.pub.gadgets.promises.defer();
			$.ajax("/api/v1/elements/" + element.id + "/status", {
				cache : false
			}).done(function(data, textStatus, jqXHR) {
				element.status = data.status;
				element.monitorStatus = $.map(data.monitorStatus, function(monitorStatus) {
					return monitorStatus.isHidden ? undefined : {
						id : monitorStatus.id,
						name : monitorStatus.name,
						status : monitorStatus.status
					};
				}).sort(function(a, b) {
					return naturalSort(a.name, b.name);
				});
				element.message = data.message;
				deferred.resolve(elementData);
			}).fail(function(jqXHR, textStatus, errorThrown) {
				deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
			});
			promises.push(deferred.promise);
		});
		return UPTIME.pub.gadgets.promises.all(promises);
	}

	function getTopologicalElements() {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements", {
			cache : false
		}).done(
				function(data, textStatus, jqXHR) {
					deferred.resolve($.map(data, function(element) {
						return !element.isMonitored
								|| !(element.topologicalParents.length > 0 || element.topologicalChildren.length > 0) ? undefined
								: {
									id : element.id,
									name : element.name,
									typeSubtypeName : element.typeSubtypeName,
									parents : element.topologicalParents,
									hasChildren : element.topologicalChildren.length > 0
								};
					}));
				}).fail(function(jqXHR, textStatus, errorThrown) {
			deferred.reject(UPTIME.pub.errors.toDisplayableJQueryAjaxError(jqXHR, textStatus, errorThrown, this));
		});
		return deferred.promise;
	}

	this.getSource = function() {
		uptimeGadget.loadSettings().then(function(settings) {
			getTopologicalElements().then(getElementStatuses).then(function(elements) {
				initializeAndBuildTree(settings, elements);
			}, displayError);
		}, displayError);
	};

	function createTreeNode(element) {
		var node = {};
		node.elementId = element.id;
		node.elementName = element.name;
		node.elementStatus = element.status;
		node.statusMessage = element.message;
		node.monitorStatus = element.monitorStatus;
		node.elementType = element.typeSubtypeName;
		node.leaves = {};
		node.branches = {};
		node.hasChildren = element.hasChildren;
		return node;
	}

	function createRootPlaceholder() {
		var root = {};
		root.elementId = 0;
		root.elementName = "up.time";
		root.elementStatus = "";
		root.statusMessage = "";
		root.monitorStatus = [];
		root.elementType = "";
		root.leaves = {};
		root.branches = {};
		root.hasChildren = true;
		return root;
	}

	function addChildNode(node, childNode) {
		if (childNode.hasChildren) {
			node.branches[childNode.elementId] = childNode;
		} else {
			node.leaves[childNode.elementId] = childNode;
		}
	}

	function createRoot(treeLookup, topLevelParentIds) {
		if (topLevelParentIds.length == 0) {
			topLevelParentIds = elementsWithNoParents;
		}
		var root;
		if (topLevelParentIds.length == 1) {
			root = treeLookup[topLevelParentIds[0]] = createTreeNode(elementLookup[topLevelParentIds[0]]);
		} else {
			root = treeLookup[0] = createRootPlaceholder();
			$.each(topLevelParentIds, function(i, topLevelParentId) {
				var node = treeLookup[topLevelParentId] = createTreeNode(elementLookup[topLevelParentId]);
				addChildNode(root, node);
			});
		}
		return root;
	}

	function buildTree(topLevelParentIds) {
		var treeLookup = {};
		var root = createRoot(treeLookup, topLevelParentIds);
		$.each(elementLookup, function(i, element) {
			createBranch(treeLookup, element, root);
		});
		$.each(treeLookup, function(i, node) {
			node.leaves = $.map(node.leaves, function(node) {
				return node;
			});
			node.branches = $.map(node.branches, function(node) {
				return node;
			});
		});
		renderTree(decompressTree(root));
	}

	function populateTopologicalParentFilter(selectedTopLevelParentIds) {
		var parents = $.map(elementsWithChildren, function(elementId) {
			return elementLookup[elementId];
		}).sort(function(a, b) {
			return naturalSort(a.name, b.name);
		});
		var topologicalParentFilter = $("#topologicalParentFilter").empty().prop('disabled', !uptimeGadget.isOwner());
		$.each(parents, function(i, parent) {
			$("<option></option>").val(parent.id).text(parent.name).prop("selected",
					$.inArray(parent.id, selectedTopLevelParentIds) > -1).appendTo(topologicalParentFilter);
		});
		if (topologicalParentFilter.hasClass("chzn-done")) {
			topologicalParentFilter.trigger("liszt:updated");
		} else {
			topologicalParentFilter.chosen().change(updateTopLevelParents);
		}
	}

	function updateTopLevelParents(event) {
		var topLevelParentIds = [];
		var selectedTopLevelParentIds = $("#topologicalParentFilter").val();
		if (selectedTopLevelParentIds && selectedTopLevelParentIds.length > 0) {
			$.each(selectedTopLevelParentIds, function(i, selectedTopLevelParentId) {
				topLevelParentIds.push(parseInt(selectedTopLevelParentId));
			});
		}
		buildTree(topLevelParentIds);
		var settings = {
			topLevelParentIds : topLevelParentIds
		};
		uptimeGadget.saveSettings(settings);
	}

	function decompressTree(source) {
		return jQuery.extend(true, {}, source);
	}

	function createBranch(treeLookup, element, root) {
		var node = treeLookup[element.id];
		if (typeof node == "undefined") {
			node = treeLookup[element.id] = createTreeNode(element);
		}
		$.each(element.parents, function(i, parent) {
			var parentNode = treeLookup[parent.id];
			if (typeof parentNode == "undefined") {
				parentNode = createBranch(treeLookup, elementLookup[parent.id], root);
			}
			addChildNode(parentNode, node);
		});
		return node;
	}

};
