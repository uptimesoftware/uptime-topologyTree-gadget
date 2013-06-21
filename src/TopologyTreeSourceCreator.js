TopologyTreeSourceCreator = function(userOptions) {
	var options = $.extend({
		treeRenderer : undefined,
		errorHandler : undefined
	}, userOptions);

	if (typeof options.treeRenderer != "function") {
		throw new TypeError("treeRenderer must be a function");
	}
	if (typeof options.errorHandler != "undefined" && typeof options.errorHandler != "function") {
		throw new TypeError("errorHandler must be a function");
	}

	var elementLookup = {};
	var elementsWithNoParents = [];
	var elementsWithChildren = [];
	var topLevelParentIds = [];
	
	this.setTopLevelParentIds = function(newTopLevelParentIds) {
		if ($.isArray(newTopLevelParentIds)) {
			topLevelParentIds = newTopLevelParentIds;
		}
	};

	function initializeAndBuildTree(elements) {
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
		topLevelParentIds = $.grep(topLevelParentIds, function(topLevelParentId) {
			return elementLookup[topLevelParentId];
		});
		populateTopologicalParentFilter();
		buildTree();
	}

	function getTopologicalElements() {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements", {
			cache : false
		}).done(
				function(data, textStatus, jqXHR) {
					deferred.resolve($.map(data, function(element) {
						return element.topologicalChildren.length == 0
								&& (element.topologicalParents.length == 0 || !element.isMonitored) ? undefined : {
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
		getTopologicalElements().then(function(elements) {
			initializeAndBuildTree(elements);
		}, options.errorHandler);
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

	function createRoot(treeLookup) {
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

	function buildTree() {
		var treeLookup = {};
		var root = createRoot(treeLookup);
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
		options.treeRenderer(decompressTree(root));
	}

	function populateTopologicalParentFilter() {
		var parents = $.map(elementsWithChildren, function(elementId) {
			return elementLookup[elementId];
		}).sort(function(a, b) {
			return naturalSort(a.name, b.name);
		});
		var topologicalParentFilter = $("#topologicalParentFilter").empty().prop('disabled', !uptimeGadget.isOwner());
		$.each(parents, function(i, parent) {
			$("<option></option>").val(parent.id).text(parent.name).prop("selected",
					$.inArray(parent.id, topLevelParentIds) > -1).appendTo(topologicalParentFilter);
		});
		if (topologicalParentFilter.hasClass("chzn-done")) {
			topologicalParentFilter.trigger("liszt:updated");
		} else {
			topologicalParentFilter.chosen().change(updateTopLevelParents);
		}
	}

	function updateTopLevelParents(event) {
		topLevelParentIds = [];
		var selectedTopLevelParentIds = $("#topologicalParentFilter").val();
		if (selectedTopLevelParentIds && selectedTopLevelParentIds.length > 0) {
			$.each(selectedTopLevelParentIds, function(i, selectedTopLevelParentId) {
				topLevelParentIds.push(parseInt(selectedTopLevelParentId));
			});
		}
		buildTree();
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
