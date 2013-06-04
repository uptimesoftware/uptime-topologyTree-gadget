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
	var canEdit = uptimeGadget.isOwner();

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
		populateTopLevelParentSelect(settings.topLevelParentIds);
		buildTree(settings.topLevelParentIds);
	}

	function getTopologicalElementStatuses(elements) {
		var promises = [];
		$.each(elements, function(i, element) {
			if (element.isMonitored && (element.topologicalParents.length > 0 || element.topologicalChildren.length > 0)) {
				var deferred = UPTIME.pub.gadgets.promises.defer();
				var elementData = {};
				elementData.id = element.id;
				elementData.name = element.name;
				elementData.typeSubtypeName = element.typeSubtypeName;
				$.ajax("/api/v1/elements/" + element.id + "/status", {
					cache : false
				}).done(function(data, textStatus, jqXHR) {
					elementData.status = data.status;
					elementData.parents = element.topologicalParents;
					elementData.hasChildren = element.topologicalChildren.length > 0;
					// TODO: trim down to name/status?
					elementData.monitorStatus = data.monitorStatus;
					elementData.message = data.message;
					deferred.resolve(elementData);
				}).fail(
						function(jqXHR, textStatus, errorThrown) {
							deferred.reject("Unable to build Topology Tree. Failed to retrieve element status for "
									+ element.name + ".");
						});
				promises.push(deferred.promise);
			}
		});
		return UPTIME.pub.gadgets.promises.all(promises);
	}

	function getElements() {
		var deferred = UPTIME.pub.gadgets.promises.defer();
		$.ajax("/api/v1/elements", {
			cache : false
		}).done(function(data, textStatus, jqXHR) {
			deferred.resolve(data);
		}).fail(function(jqXHR, textStatus, errorThrown) {
			deferred.reject("Error loading elements from up.time Controller.");
		});
		return deferred.promise;
	}

	this.getSource = function() {
		uptimeGadget.loadSettings().then(function(settings) {
			getElements().then(getTopologicalElementStatuses).then(function(elements) {
				initializeAndBuildTree(settings, elements);
			}, displayError);
		}, function() {
			displayError("Error loading Topology Tree settings.");
		});
	};

	this.rebuildTreeWithCachedResults = function() {
		updateTopLevelParents();
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
			node.leaves = $.map(node.leaves, function(v, k) {
				return v;
			});
			node.branches = $.map(node.branches, function(v, k) {
				return v;
			});
		});
		renderTree(decompressTree(root));
	}

	function populateTopLevelParentSelect(selectedTopLevelParentIds) {
		var parents = $.map(elementsWithChildren, function(v, k) {
			return elementLookup[v];
		}).sort(function(a, b) {
			return naturalSort(a.name, b.name);
		});
		var topLevelParentSelector = $("#selectTopLevelParent").empty().prop('disabled', !canEdit);
		$.each(parents, function(i, parent) {
			$("<option></option>").val(parent.id).text(parent.name).prop("selected",
					$.inArray(parent.id, selectedTopLevelParentIds) > -1).appendTo(topLevelParentSelector);
		});
		if (topLevelParentSelector.hasClass("chzn-done")) {
			topLevelParentSelector.trigger("liszt:updated");
		} else {
			topLevelParentSelector.chosen().change(updateTopLevelParents);
		}
	}

	function updateTopLevelParents(event) {
		var topLevelParentIds = [];
		var selectedTopLevelParentIds = $("#selectTopLevelParent").val();
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
